import { describe, it, expect, vi } from "vitest";

// The module imports electron + electron-updater for the TIMER; the decision tested
// here is pure. Same mock pattern as `install.test.ts`/`poll.test.ts`.
vi.mock("electron", () => ({ BrowserWindow: {}, ipcMain: { once: () => {}, removeAllListeners: () => {} }, powerMonitor: {} }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { on: () => {} } } }));
vi.mock("./install", () => ({ quitAndInstallSafely: async () => {} }));
vi.mock("./log", () => ({ logUpdate: () => {} }));
vi.mock("./track", () => ({ trackInstallDeferred: () => {} }));

import {
  AUTO_BLURRED_MS,
  AUTO_IDLE_AWAY_S,
  deferReason,
  rendererQuiescence,
  shouldAutoInstall,
  type AutoInstallSignals,
} from "./autoInstall";

const quiet = (over: Partial<AutoInstallSignals> = {}): AutoInstallSignals => ({
  staged: true,
  focused: false,
  idleS: AUTO_IDLE_AWAY_S,
  blurredMs: 0,
  mainBusy: false,
  rendererBusy: false,
  ...over,
});

describe("shouldAutoInstall — le redémarrage automatique refuse au moindre doute", () => {
  it("installe quand l'utilisateur est PARTI (inactivité système) et que rien n'est en vol", () => {
    expect(shouldAutoInstall(quiet())).toBe(true);
  });

  it("installe sur un ARRIÈRE-PLAN prolongé, même si l'utilisateur est actif ailleurs", () => {
    expect(shouldAutoInstall(quiet({ idleS: 0, blurredMs: AUTO_BLURRED_MS }))).toBe(true);
    // …but not for a five-minute detour: the relaunch steals the foreground.
    expect(shouldAutoInstall(quiet({ idleS: 0, blurredMs: 5 * 60_000 }))).toBe(false);
  });

  it("jamais sans build posé, jamais au premier plan", () => {
    expect(shouldAutoInstall(quiet({ staged: false }))).toBe(false);
    expect(shouldAutoInstall(quiet({ focused: true }))).toBe(false);
  });

  it("un flux en vol côté main refuse", () => {
    expect(shouldAutoInstall(quiet({ mainBusy: true }))).toBe(false);
  });

  it("⚠️ FAIL-CLOSED : un renderer occupé — ou qui ne répond PAS — refuse", () => {
    // An agentic turn in flight or an unsent draft (memory only) would be
    // destroyed by the restart; the renderer's silence reads as "busy", never
    // "probably free".
    expect(shouldAutoInstall(quiet({ rendererBusy: true }))).toBe(false);
    expect(shouldAutoInstall(quiet({ rendererBusy: null }))).toBe(false);
  });
});

describe("deferReason — the funnel says WHY a downloaded build waits", () => {
  it("a focused window, a turn in flight, a busy or silent renderer each name their reason", () => {
    expect(deferReason(quiet({ focused: true }))).toBe("in_use");
    expect(deferReason(quiet({ mainBusy: true }))).toBe("busy_main");
    expect(deferReason(quiet({ rendererBusy: true }))).toBe("busy_renderer");
    expect(deferReason(quiet({ rendererBusy: null }))).toBe("no_answer");
  });

  it("ordinary waiting (not idle or blurred long enough yet) is not a deferral", () => {
    expect(deferReason(quiet({ idleS: 0, blurredMs: 5 * 60_000 }))).toBeNull();
    expect(deferReason(quiet({ idleS: 0, blurredMs: 0, rendererBusy: null }))).toBeNull();
  });

  it("nothing staged ⇒ nothing to defer", () => {
    expect(deferReason(quiet({ staged: false, focused: true }))).toBeNull();
  });
});

// macOS keeps the app in the Dock after its last window closes. No window = no renderer: no
// draft, no send — « free ». Read as « silent » (= busy), a windowless app never installed.
describe("rendererQuiescence — no window is not a silent renderer", () => {
  it("windowless: free, without asking anyone", async () => {
    const ask = vi.fn(async () => null);
    await expect(rendererQuiescence(true, ask)).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("with a window: its own answer, silence included", async () => {
    await expect(rendererQuiescence(false, async () => true)).resolves.toBe(true);
    await expect(rendererQuiescence(false, async () => null)).resolves.toBeNull();
  });
});

