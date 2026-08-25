import { ipcRenderer, type IpcRendererEvent, type Rectangle } from "electron";

/** Controllable browser: an agent-driven Chromium running in a SEPARATE, isolated
 *  Electron process (its own app-owned window the user watches). The model drives
 *  its content via @openmasq/mcp (@playwright/mcp over the child's CDP); these
 *  channels just open/close the window and point it at a start URL. */
export const browser = {
  status: (): Promise<{
    enabled: boolean;
    running: boolean;
    cdpEndpoint: string | null;
  }> => ipcRenderer.invoke("browser:status"),
  show: (): Promise<void> => ipcRenderer.invoke("browser:show"),
  hide: (): Promise<void> => ipcRenderer.invoke("browser:hide"),
  setBounds: (bounds: Rectangle): Promise<void> =>
    ipcRenderer.invoke("browser:set-bounds", bounds),
  /** Signal that the model is DRIVING the browser right now → main floats the drive-halo
   *  overlay window over it. Cleared when driving stops. */
  setDriving: (on: boolean): Promise<void> => ipcRenderer.invoke("browser:set-driving", on),
  navigate: (url: string, tabId?: string): Promise<void> =>
    ipcRenderer.invoke("browser:navigate", url, tabId),
  /** Tab management — the human panel's tabs ARE the model's real CDP-target views. */
  tabNew: (url?: string): Promise<void> => ipcRenderer.invoke("browser:tab-new", url),
  tabSelect: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:tab-select", tabId),
  tabClose: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:tab-close", tabId),
  /** Session-history nav on the active tab (weaker than `navigate`). */
  goBack: (): Promise<void> => ipcRenderer.invoke("browser:back"),
  goForward: (): Promise<void> => ipcRenderer.invoke("browser:forward"),
  /** Subscribe to the agent browser's full TAB list (id/url/title/active) as it
   *  changes — user, page `window.open`, or the MODEL over CDP. Returns an unsubscribe. */
  onTabs: (
    cb: (
      tabs: Array<{
        id: string;
        url: string;
        title: string;
        active: boolean;
        loading?: boolean;
        canGoBack?: boolean;
        canGoForward?: boolean;
        favicon?: string;
      }>,
    ) => void,
  ): (() => void) => {
    const handler = (
      _e: IpcRendererEvent,
      tabs: Array<{
        id: string;
        url: string;
        title: string;
        active: boolean;
        loading?: boolean;
        canGoBack?: boolean;
        canGoForward?: boolean;
        favicon?: string;
      }>,
    ) => cb(tabs);
    ipcRenderer.on("browser:tabs", handler);
    return () => ipcRenderer.removeListener("browser:tabs", handler);
  },
  /** App shortcuts (e.g. "cmd-k") the agent window intercepted while it had keyboard
   *  focus and forwarded here. Returns an unsubscribe. */
  onShortcut: (cb: (name: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, name: string) => cb(name);
    ipcRenderer.on("browser:shortcut", handler);
    return () => ipcRenderer.removeListener("browser:shortcut", handler);
  },
};
