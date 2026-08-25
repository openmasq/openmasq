import { describe, expect, it, vi } from "vitest";
import type { TrackEvent } from "@openmasq/ui";

// The funnel's whole reason to exist: a ShipIt swap completes AFTER we quit, so "the
// update never applied" is unobservable in-process. It's reconstructed on the next launch
// from `pendingInstall` (an attempt was handed off) + `lastVersion` (it landed) — an
// attempt with no landing IS the silent-failure signal.

const { handlers, updateConfig, config } = vi.hoisted(() => ({
  handlers: new Map<string, (info: unknown) => void>(),
  updateConfig: vi.fn(() => ({})),
  config: { channel: "desktop-production" },
}));
vi.mock("electron", () => ({ app: { getVersion: () => "0.3.3" } }));
vi.mock("electron-updater", () => ({
  default: { autoUpdater: { on: (ev: string, fn: (i: unknown) => void) => handlers.set(ev, fn) } },
}));
vi.mock("./config", () => ({ getConfig: () => config, updateConfig }));
vi.mock("./log", () => ({ logUpdate: () => {} }));

import { lastSessionEvents, setupUpdateTracking, trackUpdateInstall } from "./track";

const base = { channel: "desktop-production", current: "0.3.3" };

describe("lastSessionEvents", () => {
  it("says nothing on the first launch ever — that's an install, not an update", () => {
    expect(lastSessionEvents(base)).toEqual([]);
  });

  it("says nothing on a plain relaunch of the same version", () => {
    expect(lastSessionEvents({ ...base, lastVersion: "0.3.3" })).toEqual([]);
  });

  it("reports the attempt AND the landing when the swap worked", () => {
    expect(lastSessionEvents({ ...base, lastVersion: "0.3.2", pendingInstall: "0.3.3" })).toEqual([
      { name: "update_install", channel: "desktop-production", version: "0.3.3" },
      { name: "update_installed", channel: "desktop-production", from: "0.3.2", to: "0.3.3" },
    ]);
  });

  it("reports the attempt with NO landing when ShipIt silently failed", () => {
    expect(lastSessionEvents({ ...base, lastVersion: "0.3.3", pendingInstall: "0.3.4" })).toEqual([
      { name: "update_install", channel: "desktop-production", version: "0.3.4" },
    ]);
  });

  it("reports a landing the app never asked for (an out-of-band swap / manual replace)", () => {
    expect(lastSessionEvents({ ...base, lastVersion: "0.3.2" })).toEqual([
      { name: "update_installed", channel: "desktop-production", from: "0.3.2", to: "0.3.3" },
    ]);
  });
});

describe("setupUpdateTracking", () => {
  it("turns the updater's own lifecycle events into funnel events", () => {
    const events: TrackEvent[] = [];
    setupUpdateTracking((e) => events.push(e));
    handlers.get("update-available")?.({ version: "0.3.4" });
    handlers.get("update-not-available")?.({ version: "0.3.3" });
    handlers.get("update-downloaded")?.({ version: "0.3.4" });
    expect(events).toEqual([
      { name: "update_check", channel: "desktop-production", result: "available", found_version: "0.3.4" },
      { name: "update_check", channel: "desktop-production", result: "up_to_date", found_version: "0.3.3" },
      { name: "update_downloaded", channel: "desktop-production", version: "0.3.4" },
    ]);
  });

  it("records the install attempt on DISK, not as an event (the renderer is about to die)", () => {
    const events: TrackEvent[] = [];
    setupUpdateTracking((e) => events.push(e));
    handlers.get("update-downloaded")?.({ version: "0.3.4" });
    updateConfig.mockClear();
    events.length = 0;
    trackUpdateInstall();
    expect(updateConfig).toHaveBeenCalledWith({ pendingInstall: "0.3.4" });
    expect(events).toEqual([]);
  });
});
