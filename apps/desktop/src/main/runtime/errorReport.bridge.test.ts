import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Main's telemetry reaches PostHog through the renderer. With NO renderer listening — no
// window (macOS keeps the app in the Dock), or one still booting — it used to be DROPPED: an
// install that lived windowless for days looked like one that had stopped checking for updates.

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));
vi.mock("@sentry/electron/main", () => ({ captureException: () => {}, setUser: () => {} }));

import {
  MAX_PENDING,
  installErrorReporting,
  markRendererListening,
  reportMainEvent,
  resetTelemetryBridge,
} from "./errorReport";

type Win = { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } };
const win = (): Win => ({ isDestroyed: () => false, webContents: { send: vi.fn() } });
let current: Win | null = null;
const sent = (w: Win) => w.webContents.send.mock.calls.map(([, e]) => (e as { name: string }).name);
const ev = (name: string) => ({ name }) as never;

beforeAll(() => installErrorReporting(() => current as never));
beforeEach(() => {
  resetTelemetryBridge();
  current = null;
});

describe("main → renderer telemetry waits for a renderer that listens", () => {
  it("no window: held, then delivered in order once a window listens", () => {
    reportMainEvent(ev("update_check"));
    reportMainEvent(ev("update_downloaded"));
    current = win();
    markRendererListening(current as never);
    expect(sent(current)).toEqual(["update_check", "update_downloaded"]);
  });

  it("a window still booting receives nothing until it listens", () => {
    current = win();
    reportMainEvent(ev("update_check"));
    expect(current.webContents.send).not.toHaveBeenCalled();
    markRendererListening(current as never);
    expect(sent(current)).toEqual(["update_check"]);
    reportMainEvent(ev("app_quit")); // listening now: straight through
    expect(sent(current)).toEqual(["update_check", "app_quit"]);
  });

  it("bounded: past MAX_PENDING the OLDEST reports go", () => {
    for (let i = 0; i < MAX_PENDING + 5; i++) reportMainEvent(ev(`e${i}`));
    current = win();
    markRendererListening(current as never);
    const names = sent(current);
    expect(names).toHaveLength(MAX_PENDING);
    expect(names[0]).toBe("e5");
    expect(names.at(-1)).toBe(`e${MAX_PENDING + 4}`);
  });
});
