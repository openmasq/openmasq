import { useCallback, useState } from "react";
import type { ChatStore } from "../../../state/store";
import { WorkspaceView } from "../../../workspace";
import { ArtifactProvider } from "../../providers/artifact";
import { panelCloseItem, useAppDispatch } from "../../../state/redux";
import { BottomNav } from "../BottomNav";
import { ShellChrome, ShellSplash } from "../ShellChrome";
import { useShell } from "../useShell";
import { ChatPane } from "../panes/ChatPane";
import { usePanelContent } from "../panes/PanelContent";
import { AuthoringSection, VaultSection } from "../sections";
import { MobileChatList } from "./MobileChatList";
import { MobileLibraryScreen } from "./MobileLibraryScreen";
import { MobileMemoryScreen } from "./MobileMemoryScreen";
import { MobileSettingsScreen } from "./MobileSettingsScreen";
import { MobileDocSheet } from "./MobileDocSheet";

/**
 * The phone presentation (design kit `chat-app-mobile`). Same {@link useShell} brain as
 * the desktop; what differs is native chrome and navigation — a fixed bottom tab bar
 * instead of the icon rail, the chats tab as a full-screen LIST that **pushes** the chat
 * (back chevron pops it), no drawer, no split, and documents in a bottom SHEET because a
 * phone has no right half to park them in.
 *
 * ⚠️ This file owns the mobile SHELL only. Screen composition is still the shared
 * `sections/` (desktop layouts), which is the gap the kit port closes one screen at a
 * time — a mobile screen replaces a section here, it never adds a `mobile ?` branch to a
 * shared component.
 */
export function MobileShell({ chat }: { chat: ChatStore }) {
  const dispatch = useAppDispatch();
  // `navDir` drives the one-shot push/pop slide, cleared on animation end.
  const [chatOpen, setChatOpen] = useState(false);
  const [navDir, setNavDir] = useState<"push" | "pop" | null>(null);
  const shell = useShell({
    chat,
    onEnterConversation: () => {
      setChatOpen(true);
      setNavDir("push");
    },
  });
  const { section, pane, conv, split } = shell;
  const closeChat = useCallback(() => {
    setChatOpen(false);
    setNavDir("pop");
  }, []);
  const panelContent = usePanelContent(shell, { closeOnOpenConversation: true });

  if (shell.splash) return <ShellSplash />;

  // The active non-browser panel item presents as a bottom sheet (kit DocViewerSheet).
  const docSheet = (
    <MobileDocSheet
      item={pane.visible && pane.active && pane.active.kind !== "browser" ? pane.active : null}
      renderContent={panelContent}
      onClose={(id) => dispatch(panelCloseItem(id))}
    />
  );

  const body =
    section === "settings" ? (
      // PORTED: grouped rows that push their tab, instead of the desktop icon rail.
      <MobileSettingsScreen
        settings={chat.settings}
        onChange={chat.setSettings}
        conversations={chat.conversations}
        orgProfile={chat.orgProfile}
        onSetApiKey={chat.setApiKey}
        keyConfigured={chat.keyConfigured}
        unavailableModels={chat.unavailableModels}
        onImportConversations={chat.importConversations}
        onOpenGuide={() => shell.guide.setOpen(true)}
        requestedTab={shell.deep.settingsTab}
        onOpenMessage={(convId, msgId) => {
          if (msgId) chat.openConversationAt(convId, msgId);
          else chat.setActiveId(convId);
          shell.go("chats");
        }}
      />
    ) : section === "library" ? (
      // PORTED to the kit (list + image grid + action sheet). Tapping a file opens it
      // in the shared panel, which is this sheet.
      <>
        <MobileLibraryScreen conversations={chat.conversations} />
        {docSheet}
      </>
    ) : section === "competences" ? (
      // One bottom-nav slot backs both authoring siblings; the segmented switch is how
      // Workflows stays reachable.
      <div className="mobile-screen">
        <AuthoringSection shell={shell} />
      </div>
    ) : section === "memory" ? (
      // PORTED: the desktop force GRAPH becomes the kit's grouped chip list.
      <MobileMemoryScreen
        memoire={chat.memoire}
        memoryAuto={chat.settings.memoryAuto === true}
        onToggleAuto={(on) => chat.setSettings((s) => ({ ...s, memoryAuto: on }))}
        onSetProfile={chat.setMemoryProfile}
        onAdd={chat.addMemoryCard}
        onUpdate={chat.updateMemoryCard}
        onRemove={chat.removeMemoryCard}
      />
    ) : section === "vault" ? (
      <VaultSection shell={shell} />
    ) : !chatOpen ? (
      // Chats HOME: the kit's native list screen. Picking / creating a thread pushes.
      <div
        key="mobile-list"
        className={`mobile-screen${navDir === "pop" ? " mobile-pop" : ""}`}
        onAnimationEnd={() => setNavDir(null)}
      >
        <MobileChatList
          conversations={chat.conversations}
          onSelect={conv.selectConversation}
          onNew={conv.newChat}
          onOpenSettings={() => shell.deep.openSettings()}
          userName={shell.userName}
        />
      </div>
    ) : (
      <div
        className={`chat-workspace mobile-screen${navDir === "push" ? " mobile-push" : ""}`}
        onAnimationEnd={() => setNavDir(null)}
      >
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
                  enableSplit={false}
                  onBack={closeChat}
                />
              )}
              enableSplit={false}
            />
            {docSheet}
          </div>
        </ArtifactProvider>
      </div>
    );

  return (
    <ShellChrome
      shell={shell}
      className={`app-mobile${section === "chats" && chatOpen ? " app-chat-open" : ""}`}
      footer={!(section === "chats" && chatOpen) && <BottomNav />}
    >
      {body}
    </ShellChrome>
  );
}
