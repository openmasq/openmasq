import { describe, expect, it, vi } from "vitest";

// The bug this guards: ShipIt (Squirrel.Mac) aborts the update swap with "App Still
// Running Error" when it still sees >1 running instance of the app bundle. The app
// re-spawns itself (agent browser / playwright-mcp), so those children MUST be killed
// and CONFIRMED GONE before `quitAndInstall` — the old code tore them down fire-and-
// forget in `before-quit`, losing the race with app.quit(). `quitAndInstallSafely`
// must therefore AWAIT the teardown before handing off to ShipIt.

const { quitAndInstall, trackUpdateInstall } = vi.hoisted(() => ({
  quitAndInstall: vi.fn(),
  trackUpdateInstall: vi.fn(),
}));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { quitAndInstall } } }));
vi.mock("./log", () => ({ logUpdate: () => {}, logUpdateError: () => {} }));
vi.mock("./track", () => ({ trackUpdateInstall }));

import { quitAndInstallSafely, setBeforeInstall } from "./install";

describe("quitAndInstallSafely", () => {
  it("records the attempt, awaits the pre-install teardown, THEN quitAndInstalls", async () => {
    quitAndInstall.mockClear();
    trackUpdateInstall.mockClear();
    const order: string[] = [];
    trackUpdateInstall.mockImplementation(() => order.push("record-attempt"));
    setBeforeInstall(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("teardown");
    });
    quitAndInstall.mockImplementation(() => order.push("quitAndInstall"));
    await quitAndInstallSafely();
    // The attempt is persisted first and synchronously: it's the only trace that survives
    // the quit, and the next launch turns it into `update_install`.
    expect(order).toEqual(["record-attempt", "teardown", "quitAndInstall"]);
  });

  it("still quitAndInstalls if the teardown rejects (fail-safe — the user asked to update)", async () => {
    quitAndInstall.mockClear();
    quitAndInstall.mockImplementation(() => {});
    setBeforeInstall(async () => {
      throw new Error("child kill failed");
    });
    await quitAndInstallSafely();
    expect(quitAndInstall).toHaveBeenCalledOnce();
  });
});
