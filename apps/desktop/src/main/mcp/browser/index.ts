import { type Rectangle } from "electron";
import { handle, str, bool, obj, optional } from "../../ipc/handle";
import { isBrowserAgentEnabled, setBrowserAgentEnabled } from "./cdp";
import { isAgentBrowserProcess, runAgentBrowserMain } from "./agentMain";
import { isPlaywrightMcpProcess, runPlaywrightMcpMain } from "./playwrightMcpMain";
import {
  startAgentBrowser,
  stopAgentBrowser,
  agentBrowserRunning,
  agentBrowserEndpoint,
  agentNavigate,
  agentTabNew,
  agentTabSelect,
  agentTabClose,
  agentBack,
  agentForward,
  agentShow,
  agentHide,
  agentBounds,
  setAgentDriving,
  setAppMainFocused,
  withAgentBrowserHidden,
  setAgentTabsReporter,
  setAgentShortcutReporter,
} from "./process";

export {
  isBrowserAgentEnabled,
  setBrowserAgentEnabled,
  isAgentBrowserProcess,
  runAgentBrowserMain,
  isPlaywrightMcpProcess,
  runPlaywrightMcpMain,
  startAgentBrowser,
  stopAgentBrowser,
  agentBrowserRunning,
  agentBrowserEndpoint,
  withAgentBrowserHidden,
  setAgentTabsReporter,
  setAgentShortcutReporter,
  setAppMainFocused,
};

export interface BrowserStatus {
  /** The feature is opted in. */
  enabled: boolean;
  /** The isolated agent-browser process is running with a live CDP endpoint. */
  running: boolean;
  cdpEndpoint: string | null;
}

// Renderer-facing control of the isolated agent-browser WINDOW (a separate,
// app-owned Electron window the user watches). The model drives its CONTENT via
// @playwright/mcp over the child's CDP; these channels are just for the human
// shell (open/close the window, point it at a start URL).
export function registerBrowserIpc(): void {
  handle("browser:status", [], (): BrowserStatus => ({
    enabled: isBrowserAgentEnabled(),
    running: agentBrowserRunning(),
    cdpEndpoint: agentBrowserEndpoint(),
  }));

  handle("browser:show", [], async () => {
    await startAgentBrowser();
    agentShow();
  });
  handle("browser:hide", [], () => agentHide());
  handle("browser:set-bounds", [obj], (_e, bounds) => agentBounds(bounds as unknown as Rectangle));
  // The renderer signals when the model is DRIVING → the drive-halo overlay window.
  handle("browser:set-driving", [bool], (_e, on) => setAgentDriving(on));
  handle("browser:navigate", [str, optional(str)], async (_e, url, tabId) => {
    await startAgentBrowser();
    agentNavigate(url, tabId);
  });
  // Tab management (the human panel's + the model's tabs are the SAME real views).
  handle("browser:tab-new", [optional(str)], async (_e, url) => {
    await startAgentBrowser();
    agentTabNew(url);
  });
  handle("browser:tab-select", [str], (_e, tabId) => agentTabSelect(tabId));
  handle("browser:tab-close", [str], (_e, tabId) => agentTabClose(tabId));
  // Session-history nav on the active tab — no arguments, strictly weaker than
  // `browser:navigate` (each history entry passed the child's SSRF guards on load).
  handle("browser:back", [], () => agentBack());
  handle("browser:forward", [], () => agentForward());
}
