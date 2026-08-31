import { describe, it, expect, vi } from "vitest";

// The module imports electron + electron-updater for the TIMER; the decision tested
// here is pure. Same mock pattern as `install.test.ts`/`poll.test.ts`.
vi.mock("electron", () => ({ BrowserWindow: {}, ipcMain: { once: () => {}, removeAllListeners: () => {} }, powerMonitor: {} }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { on: () => {} } } }));
vi.mock("./install", () => ({ quitAndInstallSafely: async () => {} }));
vi.mock("./log", () => ({ logUpdate: () => {} }));

import {
  AUTO_BLURRED_MS,
  AUTO_IDLE_AWAY_S,
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
