import { createContext, useContext } from "react";

/**
 * How a link in a message can be opened. The EXTERNAL browser is always available
 * (a plain `window.open` → the desktop main-process window-open handler →
 * `shell.openExternal`); the INTEGRATED agent-browser is desktop-only, so
 * `openInBrowser` is provided ONLY when `host.browser` exists (AppShell). When it's
 * undefined the hover menu offers external-only (and `MarkdownLink` skips the menu
 * entirely, since there's no choice to make — a plain click already opens external).
 */
export interface LinkOpenApi {
  /** Open the URL in the split-screen integrated browser (opens the panel +
   *  navigates). Absent on platforms without the agent browser. */
  openInBrowser?: (url: string) => void;
}

const LinkOpenContext = createContext<LinkOpenApi>({});

export const LinkOpenProvider = LinkOpenContext.Provider;

/** The link-open controls (integrated-browser opener, if available). */
export function useLinkOpen(): LinkOpenApi {
  return useContext(LinkOpenContext);
}
