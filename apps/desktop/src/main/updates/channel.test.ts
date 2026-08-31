import { beforeEach, describe, expect, it, vi } from "vitest";

// Changing channel decides which BUILDS this install receives — not which API it
// talks to: since the single artifact, the environment is changed elsewhere and under its own
// right (`../ipc/registerEnvIpc.ts`). The version picker only offers it to a
// privileged device, but that gate is UI, and a renderer XSS calls the IPC
// directly (rule 7). These cases pin the main-side guard.

const cfg = { channel: "desktop-production", installId: "inst-1" };
const applyFeed = vi.fn();

vi.mock("electron", () => ({ app: { isPackaged: true } }));
vi.mock("./config", () => ({
  DEFAULT_CHANNEL: "desktop-production",
  applyFeed: (...args: unknown[]) => applyFeed(...args),
  feedBase: (c: string) => `https://updates.test/desktop/${c}`,
  getConfig: () => cfg,
  updateConfig: (patch: Record<string, unknown>) => Object.assign(cfg, patch),
}));

import { classifyChannelChange, requestChannelChange } from "./channel";

const classify = (wanted: unknown, current = "desktop-production"): ReturnType<typeof classifyChannelChange> =>
  classifyChannelChange({ wanted, current, baked: "desktop-production" });

const answerPermission = (allow: boolean | "boom"): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (allow === "boom") throw new Error("offline");
      return new Response(JSON.stringify({ allow_self_pin: allow }), { status: 200 });
    }),
  );
};

beforeEach(() => {
  cfg.channel = "desktop-production";
  applyFeed.mockClear();
  vi.unstubAllGlobals();
});

describe("classifyChannelChange (pure)", () => {
  it("refuses anything not on the allow-list", () => {
    // The value came from the renderer; it used to be persisted verbatim and the
    // feed re-pointed at `<worker>/desktop/<whatever>`.
    for (const bad of ["", "   ", "evil.example.com", "desktop-prod", 42, null, undefined, { channel: "x" }]) {
      expect(classify(bad)).toEqual({ kind: "refuse", reason: "unknown_channel" });
    }
  });

  it("lets an install return to its OWN baked channel without asking", () => {
    // Undoing a switch is not performing one — and refusing it would strand an
    // install on a channel it can never leave.
    expect(classify("desktop-production", "desktop-staging")).toEqual({
      kind: "allow",
      channel: "desktop-production",
    });
  });

  it("treats staying put as a no-op, not a privileged move", () => {
    expect(classify("desktop-staging", "desktop-staging")).toEqual({
      kind: "allow",
      channel: "desktop-staging",
    });
  });

  it("requires the permission to move to ANOTHER environment", () => {
    expect(classify("desktop-staging")).toEqual({ kind: "needs-permission", channel: "desktop-staging" });
  });
});

describe("requestChannelChange (gate + effect)", () => {
  it("does not touch the config when the target is refused", async () => {
    const res = await requestChannelChange("desktop-winci-evil");
    expect(res).toEqual({ ok: false, reason: "unknown_channel", channel: "desktop-production" });
    expect(cfg.channel).toBe("desktop-production");
    expect(applyFeed).not.toHaveBeenCalled();
  });

  it("refuses a cross-environment move when the Worker says the device may not", async () => {
    answerPermission(false);
    const res = await requestChannelChange("desktop-staging");
    expect(res).toEqual({ ok: false, reason: "not_privileged", channel: "desktop-production" });
    expect(cfg.channel).toBe("desktop-production");
  });

  it("FAILS CLOSED when the permission cannot be read at all", async () => {
    answerPermission("boom");
    const res = await requestChannelChange("desktop-staging");
    expect(res.ok).toBe(false);
    expect(cfg.channel).toBe("desktop-production");
  });

  it("performs the move for a privileged device", async () => {
    answerPermission(true);
    const res = await requestChannelChange("desktop-staging");
    expect(res).toEqual({ ok: true, channel: "desktop-staging" });
    expect(cfg.channel).toBe("desktop-staging");
    expect(applyFeed).toHaveBeenCalledWith("desktop-staging");
  });

  it("returns home with no permission call at all", async () => {
    cfg.channel = "desktop-staging";
    answerPermission(false); // would refuse if it were consulted
    const res = await requestChannelChange("desktop-production");
    expect(res).toEqual({ ok: true, channel: "desktop-production" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
