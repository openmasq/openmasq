import type { ReactNode } from "react";
import { panelCloseItem, panelSelect, useAppDispatch, type PanelItem } from "../../../state/redux";
import { ArtifactPanel, BrowserPanel } from "../../../pages/ChatWorkspace";
import type { Artifact } from "../../providers/artifact";
import { PanelFileView } from "../PanelFileView";
import { LocalFilePanel } from "../folders/LocalFilePanel";
import { SidePanel } from "../SidePanel";
import type { ShellApi } from "../useShell";

/**
 * The per-kind content of THE side panel — browser, artifact, document. ONE mapping, two
 * presentations: the desktop `SidePanel` beside the split, and the mobile bottom sheet.
 * The viewers are identical in both, so behaviour never diverges; only the chrome does.
 *
 * `closeOnOpenConversation` is the one difference a phone forces: « Utilisé dans N
 * conversations » lands ON the conversation with the document still open beside it on
 * desktop, but a sheet would cover the pushed chat — so there it closes instead.
 */
export function usePanelContent(
  shell: ShellApi,
  { closeOnOpenConversation }: { closeOnOpenConversation: boolean },
): (item: PanelItem) => ReactNode {
  const dispatch = useAppDispatch();
  const { chat, host, pane, conv } = shell;
  return (item: PanelItem) =>
    item.kind === "browser" ? (
      <BrowserPanel
        browser={host.browser}
        onClose={() => dispatch(panelCloseItem("browser"))}
        navRequest={pane.browserNav ?? undefined}
        onNavConsumed={pane.clearBrowserNav}
        automationNonce={chat.browserActivity}
        driving={pane.browserDriving}
        searchEngine={chat.settings.browserSearchEngine}
        onSearchEngineChange={(id) =>
          chat.setSettings({ ...chat.settings, browserSearchEngine: id })
        }
        bookmarks={chat.settings.browserBookmarks ?? []}
        onAsk={shell.askAboutPage}
      />
    ) : item.kind === "artifact" ? (
      <ArtifactPanel
        artifact={item.artifact as Artifact}
        onClose={() => dispatch(panelCloseItem(item.id))}
      />
    ) : item.kind === "localfile" ? (
      // A file in a folder the user granted — the SAME viewer as a stored one, only the
      // byte source differs (read from disk on each open, never copied here).
      <LocalFilePanel
        path={item.path}
        name={item.name}
        onClose={() => dispatch(panelCloseItem(item.id))}
        onAttach={shell.attachFile}
      />
    ) : (
      <PanelFileView
        id={item.id}
        name={item.name}
        mime={item.mime}
        convId={item.convId}
        conversations={chat.conversations}
        onClose={() => dispatch(panelCloseItem(item.id))}
        onReattach={shell.reattach}
        // Land ON the conversation, scrolled to the message the file was attached to
        // (`.msg-flash` marks it).
        onOpenConversation={(id, msgId) => {
          if (closeOnOpenConversation) dispatch(panelCloseItem(item.id));
          conv.selectConversation(id);
          if (msgId) chat.openConversationAt(id, msgId);
        }}
      />
    );
}

/**
 * The desktop presentation: dumb chrome (its own document tab strip) + the content slot.
 * Rendered by BOTH the chats and the bibliothèque from the SAME `panel` slice, so the
 * open items follow the user across sections.
 */
export function ShellSidePanel({
  shell,
  renderContent,
}: {
  shell: ShellApi;
  renderContent: (item: PanelItem) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const { pane, go } = shell;
  return (
    <SidePanel
      items={pane.items}
      activeId={pane.active?.id ?? null}
      onSelect={(id) => dispatch(panelSelect(id))}
      onCloseItem={(id) => dispatch(panelCloseItem(id))}
      onOpenFile={() => go("library")}
      renderContent={renderContent}
    />
  );
}
