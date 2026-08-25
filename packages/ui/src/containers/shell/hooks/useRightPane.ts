import { useCallback, useMemo, useState } from "react";
import { useHost } from "../../../host";
import type { ChatStore } from "../../../state/store";
import {
  panelCloseItem,
  panelOpenArtifact,
  panelOpenBrowser,
  panelOpenLocalFile,
  useAppDispatch,
  useAppSelector,
  type PanelItem,
  type Section,
} from "../../../state/redux";
import { baseName, rootOf } from "../../../state/localFsPaths";
import { useLocalFsRoots } from "./useLocalFsRoots";
import { useBrowserBusy } from "../../../hooks/useBrowserBusy";
import { useBrowserDriving } from "../../../hooks/useBrowserDriving";
import { useBrowserTabs } from "../../../hooks/useBrowserTabs";
import { labelOf } from "../../../pages/ChatWorkspace/BrowserPanel/browserTarget";
import { useAgentBrowserVisibility } from "./useAgentBrowserVisibility";
import type { Artifact, ArtifactApi } from "../../providers/artifact";
import type { LinkOpenApi } from "../../providers/linkOpen";
import type { FileOpenApi } from "../../providers/fileOpen";
import type { RailBrowserTab } from "../RightRail";

export type RightPane = {
  items: PanelItem[];
  active: PanelItem | null;
  /** The panel has something to show AND this section hosts it (`chats` + `library`). */
  visible: boolean;
  browserOnScreen: boolean;
  browserBusy: boolean;
  browserDriving: boolean;
  /** A URL handed to `BrowserPanel`'s tab model; the nonce re-opens even the SAME url. */
  browserNav: { url: string; nonce: number } | null;
  clearBrowserNav: () => void;
  openBrowser: () => void;
  artifactApi: ArtifactApi;
  linkOpenApi: LinkOpenApi;
  fileOpenApi: FileOpenApi;
  /** The agent browser's REAL web tabs, as the RightRail lists them. */
  railBrowserTabs: RailBrowserTab[];
  activeWebTab: string | null;
  webTabCount: number;
};

/**
 * THE side panel — everything non-chat (browser, documents, artifacts) lives in ONE
 * right-half panel, shared by the chats and the bibliothèque so the open items follow the
 * user across sections. This hook owns its derived state and the browser's entry points;
 * the two PRESENTATIONS (desktop `SidePanel` beside a split, mobile `MobileDocSheet`)
 * read the same values.
 */
export function useRightPane({ chat, section }: { chat: ChatStore; section: Section }): RightPane {
  const dispatch = useAppDispatch();
  const host = useHost();
  const panel = useAppSelector((s) => s.panel);
  const active =
    panel.items.find((i) => i.id === panel.activeId) ?? panel.items[panel.items.length - 1] ?? null;
  const visible =
    panel.open && panel.items.length > 0 && (section === "chats" || section === "library");
  const browserOnScreen = visible && active?.kind === "browser";

  // The activity signal: a pulsing dot raised when the agent drives the browser while it
  // is NOT on screen, cleared once it is. "Driving right now" (5s lull) is the separate
  // drive dot, on- or off-screen.
  const browserBusy = useBrowserBusy(chat.browserActivity, !!host.browser, browserOnScreen);
  const browserDriving = useBrowserDriving(chat.browserActivity, !!host.browser, chat.isStreaming);
  useAgentBrowserVisibility(browserOnScreen);

  const [browserNav, setBrowserNav] = useState<{ url: string; nonce: number } | null>(null);
  // THE way to open the browser (rail, link hover menu): its panel item. BrowserPanel
  // owns the child tab model once mounted — don't mint a second entry point.
  const openBrowser = useCallback(() => {
    dispatch(panelOpenBrowser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeArtifact = visible && active?.kind === "artifact" ? (active.artifact as Artifact) : null;
  const artifactApi = useMemo(
    () => ({
      active: activeArtifact,
      open: (a: Artifact) => dispatch(panelOpenArtifact(a)),
      close: () => {
        if (activeArtifact) dispatch(panelCloseItem(`artifact-${activeArtifact.id}`));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeArtifact],
  );

  // Open a message link in the integrated agent browser. Desktop only (`host.browser`) —
  // its absence is the signal "this platform has no agent browser". http(s) only; main
  // re-guards the scheme anyway (the renderer is untrusted).
  const linkOpenApi = useMemo<LinkOpenApi>(
    () => ({
      openInBrowser: host.browser
        ? (url: string) => {
            if (!/^https?:\/\//i.test(url)) return;
            openBrowser();
            // Hand the URL to BrowserPanel's tab model (new tab / re-focus) instead of
            // navigating the window directly — that bypassed the tabs.
            setBrowserNav((prev) => ({ url, nonce: (prev?.nonce ?? 0) + 1 }));
          }
        : undefined,
    }),
    [host.browser, openBrowser],
  );

  // Open a LOCAL file path named in a message in the panel viewer. Desktop-only
  // (`host.localFs`); the icon draws only for a path inside a GRANTED root (pure
  // `rootOf`, zero IPC per mark — never an existence probe). UX gate only: main's
  // `grant.resolve()` re-checks every read, the renderer never decides access.
  const fsRoots = useLocalFsRoots();
  const fileOpenApi = useMemo<FileOpenApi>(
    () => ({
      openLocalPath: host.localFs
        ? (path: string) => dispatch(panelOpenLocalFile({ path, name: baseName(path) }))
        : undefined,
      isOpenablePath:
        host.localFs && fsRoots.length ? (path: string) => rootOf(path, fsRoots) !== null : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host.localFs, fsRoots],
  );

  // The rail lists tabs ONLY while a browser panel item actually exists — the child
  // process (and thus `webTabs`) can outlive a closed panel, so keying the list on
  // `webTabs` alone left a phantom `about:blank` tab in the rail after closing. Until the
  // child reports (spawning / non-desktop fallback), the open item stands in as one
  // untitled tab so the rail never reads empty while a browser is plainly on screen.
  const webTabs = useBrowserTabs(host.browser);
  const browserItems = panel.items.filter((i) => i.kind === "browser");
  const hasBrowser = browserItems.length > 0;
  const railBrowserTabs: RailBrowserTab[] = !hasBrowser
    ? []
    : webTabs.length
      ? webTabs.map((t) => ({
          id: t.id,
          label: t.title?.trim() || labelOf(t.url),
          favicon: t.favicon,
          agent: t.agent,
        }))
      : browserItems.map(() => ({ id: "browser", label: "Navigateur" }));
  const activeWebTab = !hasBrowser ? null : (webTabs.find((t) => t.active)?.id ?? "browser");

  return {
    items: panel.items,
    active,
    visible,
    browserOnScreen,
    browserBusy,
    browserDriving,
    browserNav,
    clearBrowserNav: () => setBrowserNav(null),
    openBrowser,
    artifactApi,
    linkOpenApi,
    fileOpenApi,
    railBrowserTabs,
    activeWebTab,
    webTabCount: webTabs.length,
  };
}
