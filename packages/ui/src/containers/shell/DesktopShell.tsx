import { useCallback, useState } from "react";
import type { ChatStore } from "../../state/store";
import type { VaultTerm, Skill } from "../../types";
import { WorkspaceView } from "../../workspace";
import { SplitGutter } from "../../pages/ChatWorkspace";
import { ArtifactProvider } from "../providers/artifact";
import { useOpenConnector } from "../providers/connectors";
import { panelCloseItem, panelHide, useAppDispatch } from "../../state/redux";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";
import { RightRail } from "./RightRail";
import { ShareInbox } from "../orgShares/ShareInbox";
import { ShellChrome, ShellSplash } from "./ShellChrome";
import { useShell } from "./useShell";
import { useOpenDeliverable } from "./hooks/useOpenDeliverable";
import { ChatPane } from "./panes/ChatPane";
import { ShellSidePanel, usePanelContent } from "./panes/PanelContent";
import {
  AuthoringSection,
  LibrarySection,
  MemorySection,
  SettingsSection,
  VaultSection,
} from "./sections";

/**
 * The desktop / web presentation: a far-left icon rail that expands into the conversation
 * sidebar, a tiling workspace of conversation panes, and THE side panel on the right —
 * everything non-chat (browser, documents, artifacts) shares that one half, behind a
 * draggable gutter, in the chats AND the bibliothèque alike.
 *
 * All the behaviour is in {@link useShell}; this file only decides where things sit.
 */
export function DesktopShell({ chat }: { chat: ChatStore }) {
  const dispatch = useAppDispatch();
  const shell = useShell({ chat });
  const { section, pane, conv, split, host, search, feedback: feedback } = shell;
  // Collapsed by default → only the icon rail shows; the conversation sidebar opens on
  // demand from the chat toolbar OR any page header's toggle.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const panelContent = usePanelContent(shell, { closeOnOpenConversation: false });
  // Absent ⇒ nothing mounts the modal (aperçu, test): falls back to Settings.
  const openModal = useOpenConnector();
  const openConnector = useCallback(
    (id: string) => (openModal ? openModal(id) : shell.deep.openSettings("mcp", id)),
    [openModal, shell.deep],
  );
  // A document a turn produces opens itself beside the reply. Desktop only — the mobile
  // panel is a full-screen sheet, which would cover the answer (`hooks/deliverable.ts`).
  useOpenDeliverable({ chat, section });

  if (shell.splash) return <ShellSplash />;

  // Rail ⇄ Sidebar is NOT a hard swap — both stay mounted inside a dock that animates its
  // WIDTH (what the content pane reflows against) while the two panels crossfade.
  const nav = (
    <div className={`nav-dock${sidebarOpen ? " open" : ""}`}>
      <div className="nav-dock-panel nav-dock-rail" aria-hidden={sidebarOpen}>
        <Rail
          conversations={chat.conversations}
          onExpand={() => setSidebarOpen(true)}
          onNew={conv.newChat}
          onSelect={conv.selectConversation}
          onOpenSearch={() => search.setOpen(true)}
          userName={shell.userName}
          onOpenSettings={shell.deep.openSettings}
        />
      </div>
      <div className="nav-dock-panel nav-dock-sidebar" aria-hidden={!sidebarOpen}>
        <Sidebar
          conversations={chat.conversations}
          activeId={chat.activeId}
          onSelect={conv.selectConversation}
          onNew={conv.newChat}
          onOpenSettings={shell.deep.openSettings}
          onOpenSearch={() => search.setOpen(true)}
          pinnedSkills={chat.pinned}
          onUseSkill={shell.stageSkill}
          userName={shell.userName}
          onRename={chat.renameConversation}
          onDelete={conv.deleteConversation}
        />
      </div>
    </div>
  );

  // The panel renders in the SAME split container in both sections it can appear in
  // (card + gutter + panel), so a file opens in the identical layout everywhere and
  // survives the trip back to the conversations.
  const gutterAndPanel = (
    <>
      {pane.visible && <SplitGutter containerRef={split.ref} onRatio={split.setRatio} />}
      {pane.visible && <ShellSidePanel shell={shell} renderContent={panelContent} />}
    </>
  );

  const body =
    section === "settings" ? (
      <SettingsSection shell={shell} onToggleSidebar={toggleSidebar} />
    ) : section === "library" ? (
      <div className="chat-workspace">
        <div className="chat-split" ref={split.ref} style={split.style}>
          <LibrarySection shell={shell} onToggleSidebar={toggleSidebar} />
          {gutterAndPanel}
        </div>
      </div>
    ) : section === "competences" ? (
      <div className="contents">
        <AuthoringSection shell={shell} onToggleSidebar={toggleSidebar} />
      </div>
    ) : section === "memory" ? (
      <MemorySection shell={shell} onToggleSidebar={toggleSidebar} />
    ) : section === "vault" ? (
      <VaultSection shell={shell} onToggleSidebar={toggleSidebar} />
    ) : (
      <div className="chat-workspace">
        <ArtifactProvider value={pane.artifactApi}>
          <div className="chat-split" ref={split.ref} style={split.style}>
            <WorkspaceView
              resolveTab={conv.resolveTab}
              renderPane={(activeTab, paneId, focused, onTabPointerDown) => (
                <ChatPane
                  shell={shell}
                  activeTab={activeTab}
                  paneId={paneId}
                  focused={focused}
                  onTabPointerDown={onTabPointerDown}
                  enableSplit
                  onToggleSidebar={toggleSidebar}
                />
              )}
            />
            {gutterAndPanel}
          </div>
        </ArtifactProvider>
      </div>
    );

  // The right rail is a SHELL sibling on the `.app` frame (like the left nav-dock), not a
  // child of the workspace card, and only where the shared panel lives.
  // Accepting a PERSON share adopts its items into the PERSONAL lists — « vous
  // gardez votre copie » goes both ways (design). Dedup terms by id; a
  // compétence adopts as a fresh entry (its author keeps theirs).
  const adoptShare = (items: { terms: VaultTerm[]; competences: Skill[] }) => {
    if (items.terms.length)
      shell.chat.setSettings((st) => ({
        ...st,
        coffre: [
          ...(st.coffre ?? []),
          ...items.terms.filter((t) => !(st.coffre ?? []).some((x) => x.id === t.id)),
        ],
      }));
    for (const c of items.competences)
      shell.chat.addSkill({
        name: c.name,
        prompt: c.prompt,
        desc: c.desc,
        cat: c.cat,
        servers: c.servers,
      });
  };

  const footer = (section === "chats" || section === "library") && (
    <RightRail
      browserTabs={pane.railBrowserTabs}
      activeBrowserTab={pane.activeWebTab}
      browserOnScreen={pane.browserOnScreen}
      browserBusy={pane.browserBusy}
      driving={pane.browserDriving}
      onNewBrowser={() => {
        // Browser already live → a REAL new tab; else just bring the panel up.
        if (pane.browserOnScreen && host.browser?.tabNew) void host.browser.tabNew();
        else pane.openBrowser();
      }}
      onSelectBrowserTab={(id) => {
        if (pane.browserOnScreen && id === pane.activeWebTab) {
          dispatch(panelHide()); // active tab click = collapse (kit)
          return;
        }
        pane.openBrowser();
        if (id !== "browser" && host.browser?.tabSelect) void host.browser.tabSelect(id);
      }}
      onOpenUpdate={() => shell.update.setOpen(true)}
      updateVersion={shell.update.version}
      onOpenGuide={() => shell.guide.setOpen(true)}
      onOpenFeedback={host.feedback ? () => feedback.setOpen({}) : undefined}
      shareInbox={<ShareInbox wide inOrg={!!chat.orgProfile} onAdopt={adoptShare} />}
      shareInboxNarrow={<ShareInbox inOrg={!!chat.orgProfile} onAdopt={adoptShare} />}
      // Granting and revoking a folder happens in ONE place — the Filesystem connector —
      // so the tree links there instead of growing a second grant surface.
      // The connector modal opens OVER the panel: granting a folder or
      // connecting Drive from the source list no longer leaves the screen to
      // come back. No opener mounted (aperçu, test) ⇒ the old link to Settings.
      onManageFolders={() => openConnector("filesystem")}
      onOpenConnector={openConnector}
      onAskTarget={shell.askAboutTarget}
      onCloseBrowserTab={(id) => {
        // Closing the LAST real tab closes the panel item (the child always keeps ≥1 tab
        // alive, so without this the panel would never close).
        if (id === "browser" || pane.webTabCount <= 1) dispatch(panelCloseItem("browser"));
        else if (host.browser?.tabClose) void host.browser.tabClose(id);
      }}
    />
  );

  return (
    <ShellChrome shell={shell} nav={nav} footer={footer}>
      {body}
    </ShellChrome>
  );
}
