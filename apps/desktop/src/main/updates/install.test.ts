import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain quit with a build staged: the installer applies it as the app exits, but it refuses
// the swap while the self-spawned children are alive — and a plain quit stopped them without
// waiting. The quit is held once, the attempt recorded, the teardown AWAITED, then the quit
// goes through. Seen on 0.11.2: twelve downloads of the same build, never an install.

const { handlers, updater, track } = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  updater: {
    autoInstallOnAppQuit: true,
    on: (ev: string, fn: () => void) => handlers.set(ev, fn),
    quitAndInstall: vi.fn(),
  },
  track: { trackUpdateInstall: vi.fn() },
}));
vi.mock("electron-updater", () => ({ default: { autoUpdater: updater } }));
vi.mock("./log", () => ({ logUpdate: () => {}, logUpdateError: () => {} }));
vi.mock("./track", () => track);

import { installOnQuit, quitAndInstallSafely, resetInstallState, setBeforeInstall } from "./install";

function fakeApp() {
  let listener: ((e: { preventDefault(): void }) => void) | null = null;
  const app = {
    on: (_ev: "before-quit", fn: (e: { preventDefault(): void }) => void) => {
      listener = fn;
    },
    quit: vi.fn(),
  };
  const beforeQuit = () => {
    const e = { preventDefault: vi.fn() };
    listener?.(e);
    return e;
  };
  return { app, beforeQuit };
}

const order: string[] = [];
beforeEach(() => {
  handlers.clear();
  order.length = 0;
  resetInstallState();
  updater.autoInstallOnAppQuit = true;
  track.trackUpdateInstall.mockClear();
  updater.quitAndInstall.mockClear();
  setBeforeInstall(async () => {
    order.push("teardown");
  });
});

describe("installOnQuit — a plain quit installs only once the children are gone", () => {
  it("nothing staged: the quit goes straight through", () => {
    const { app, beforeQuit } = fakeApp();
    installOnQuit(app);
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
  });

  it("a staged build: held once, attempt recorded, teardown awaited, THEN quit", async () => {
    const { app, beforeQuit } = fakeApp();
    app.quit.mockImplementation(() => order.push("quit"));
    installOnQuit(app);
    handlers.get("update-downloaded")!();
    const e = beforeQuit();
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(track.trackUpdateInstall).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
    expect(order).toEqual(["teardown", "quit"]);
    // The quit it re-issues is let through — no loop.
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
  });

  it("the restart button's own quit is not intercepted a second time", async () => {
    const { app, beforeQuit } = fakeApp();
    installOnQuit(app);
    handlers.get("update-downloaded")!();
    await quitAndInstallSafely();
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
  });

  it("a staged build that failed to apply, or no install-on-quit: nothing is held", () => {
    const { app, beforeQuit } = fakeApp();
    installOnQuit(app);
    handlers.get("update-downloaded")!();
    handlers.get("error")!();
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
    handlers.get("update-downloaded")!();
    updater.autoInstallOnAppQuit = false;
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
  });
});
