import { useEffect, useState } from "react";
import type { BrowserHost } from "../host";

/** One REAL web tab of the agent browser, as reported by the isolated child. */
export interface BrowserWebTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  /** The tab the model is currently driving — the drive indicator follows THIS, not `active`. */
  agent?: boolean;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** The site favicon as a raster `data:` URL (main fetched it hardened; never remote), else absent. */
  favicon?: string;
}

/**
 * Mirror of the agent browser's authoritative TAB LIST for the shell (the right
 * rail lists one entry per real web tab). A second, independent subscriber to
 * `browser.onTabs` — the BrowserPanel keeps its own for the URL bar; both see
 * the same child report. Empty until the child runs / on platforms without it.
 */
export function useBrowserTabs(browser: BrowserHost | undefined): BrowserWebTab[] {
  const [tabs, setTabs] = useState<BrowserWebTab[]>([]);
  useEffect(() => {
    if (!browser?.onTabs) return;
    return browser.onTabs((rep) => setTabs(rep));
  }, [browser]);
  return tabs;
}
