import { describe, it, expect, vi } from "vitest";

// Le module importe electron + electron-updater pour la MINUTERIE ; la décision testée
// ici est pure. Même patron de mock que `install.test.ts`/`poll.test.ts`.
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
    // …mais pas pour un détour de cinq minutes : le relaunch vole le premier plan.
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
    // Un tour agentique en vol ou un brouillon non envoyé (mémoire seulement) serait
    // détruit par le redémarrage ; le silence du renderer se lit « occupé », jamais
    // « probablement libre ».
    expect(shouldAutoInstall(quiet({ rendererBusy: true }))).toBe(false);
    expect(shouldAutoInstall(quiet({ rendererBusy: null }))).toBe(false);
  });
});
