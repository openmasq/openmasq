import type { PointerEvent } from "react";
import { ChatView } from "../../../pages/ChatWorkspace";
import type { Attachment } from "../../../pages/ChatWorkspace/Composer";
import type { ConvTab } from "../../../pages/ChatWorkspace";
import { newPaneId } from "../../../workspace";
import { findLeaf, isChatRef, tabRefId } from "../../../workspace/layout";
import {
  closeTab,
  focusPane,
  openTab,
  panelOpenFile,
  setActiveTab,
  splitWithTab,
  useAppDispatch,
} from "../../../state/redux";
import { canPitchSubscription } from "../../../state/billing";
import { sendTargetConvId } from "../../../hooks/workspaceSeed";
import type { ShellApi } from "../useShell";

/**
 * ONE pane of the tiling workspace: a `ChatView` whose send / stop / regenerate / delete
 * are bound to THAT pane's conversation, so a non-focused pane sends into its own thread.
 * Global chrome (the sidebar toggle, the mobile back chevron) shows only on the focused
 * pane to avoid duplicates; per-conversation actions (shield, more-menu) show per pane.
 *
 * This is prop-threading, nothing else — every decision it forwards already lives in
 * `useShell`. The only platform-shaped input is `enableSplit`: a phone has no split
 * layout, so a fork opens a tab there instead of a sibling pane.
 */
export function ChatPane({
  shell,
  activeTab,
  paneId,
  focused,
  onTabPointerDown,
  enableSplit,
  onToggleSidebar,
  onBack,
}: {
  shell: ShellApi;
  activeTab: string | null;
  paneId: string;
  focused: boolean;
  onTabPointerDown: ((id: string, e: PointerEvent) => void) | undefined;
  enableSplit: boolean;
  onToggleSidebar?: () => void;
  onBack?: () => void;
}) {
  const dispatch = useAppDispatch();
  const { chat, host, conv, deep, pending } = shell;
  const convId = activeTab && isChatRef(activeTab) ? tabRefId(activeTab) : null;
  const conversation = convId ? (chat.conversations.find((c) => c.id === convId) ?? null) : null;
  // This pane's OWN tabs (the header renders them — one bar per pane).
  const leaf = findLeaf(shell.layout, paneId);
  const paneTabs = (leaf?.tabs ?? []).map(conv.resolveTab).filter((t): t is ConvTab => t !== null);
  const activeTabId = leaf?.activeTab && isChatRef(leaf.activeTab) ? tabRefId(leaf.activeTab) : null;

  // The store parks staged files WITHOUT reading their shape (a `state/` → `pages/` import
  // is the up-tree dependency this package forbids), so the one cast lives here — at the
  // wiring point whose job is exactly to adapt the two sides.
  const getStagedFiles = chat.getStagedAttachments as (id: string) => readonly Attachment[];

  return (
    <ChatView
      conversation={conversation}
      userName={shell.greetingName}
      tabs={paneTabs}
      activeId={activeTabId}
      onSelectTab={(id) => {
        dispatch(setActiveTab({ paneId, convId: id }));
        chat.setActiveId(id);
      }}
      onCloseTab={(id) => dispatch(closeTab(id))}
      onTabPointerDown={onTabPointerDown}
      onSplitTab={
        onTabPointerDown
          ? (id, side) =>
              dispatch(
                splitWithTab({
                  targetPane: paneId,
                  convId: id,
                  direction: "row",
                  position: side === "left" ? "before" : "after",
                  newPaneId: newPaneId(),
                }),
              )
          : undefined
      }
      isStreaming={chat.isStreaming}
      onSend={(text, attachments, opts) => {
        // Create-and-open a fresh conversation HERE (like newChat / fork / reattach) when
        // the pane has no LIVE conversation — the send must not lean on the store's
        // ambiguous `activeId`. Two cases resolve `conversation` to null and BOTH need a
        // fresh one, or the send silently vanishes: zero tabs (welcome screen), and a
        // GHOST tab whose conversation no longer exists (`convId` truthy-but-dead).
        let id = sendTargetConvId(convId, !!conversation);
        if (!id) {
          id = chat.createConversation();
          dispatch(focusPane(paneId));
          dispatch(openTab(id));
        }
        return chat.sendMessage(text, attachments, { ...opts, convId: id });
      }}
      // This PANE's conversation, not the store's globally-active one — in a split
      // workspace a non-focused pane must preview its OWN rules, not whichever tab
      // was last clicked elsewhere.
      onDetectPii={(text, signal) => chat.detectPii(text, signal, convId)}
      // « Comprendre mon redaction » → the guide, opened on ITS chapter.
      onOpenGuideChapter={shell.guide.openChapter}
      onStop={() => conv.stopPane(convId)}
      onChangeModel={conv.changeModel}
      onRegenerate={(assistantId) => void chat.regenerate(assistantId, convId ?? undefined)}
      onEditDocument={
        convId
          ? (messageId, oldText, newText) => chat.editDocument(convId, messageId, oldText, newText)
          : undefined
      }
      onFork={
        convId
          ? (messageId) => {
              const forkId = chat.forkConversation(convId, messageId);
              if (!forkId) return;
              // Open the fork SIDE-BY-SIDE, to the RIGHT of the forked conversation —
              // not a detached new tab. Without a split layout, a tab is the fallback.
              if (!enableSplit) {
                dispatch(openTab(forkId));
                return;
              }
              const np = newPaneId();
              dispatch(
                splitWithTab({
                  targetPane: paneId,
                  convId: forkId,
                  direction: "row",
                  position: "after",
                  newPaneId: np,
                }),
              );
              dispatch(focusPane(np));
            }
          : undefined
      }
      onOpenFileTab={(file) =>
        dispatch(panelOpenFile({ id: file.id, name: file.name, mime: file.mime, convId: file.convId }))
      }
      onNew={() => {
        dispatch(focusPane(paneId));
        conv.newChat();
      }}
      onOpenSettings={deep.openSettings}
      onToggleSidebar={focused ? onToggleSidebar : undefined}
      onBack={focused ? onBack : undefined}
      getDraft={chat.getDraft}
      onDraftChange={chat.setDraft}
      getStagedFiles={getStagedFiles}
      onStagedFilesChange={chat.setStagedAttachments}
      onDelete={convId ? () => conv.deleteConversation(convId) : undefined}
      settings={chat.settings}
      onChangeSettings={chat.setSettings}
      onChangeConversation={chat.setConversationCategories}
      onSetMemoryOff={chat.setConversationMemoryOff}
      onToggleNeutralMarks={chat.toggleConversationNeutralMarks}
      onReveal={chat.revealRedaction}
      onReRedact={chat.reRedact}
      isRevealForced={chat.isRevealForced}
      onForceRedact={chat.forceRedact}
      onAddToCoffre={chat.addCoffreTerm}
      onAddMemoryCard={chat.addMemoryCard}
      memoryHint={!!host.complete}
      onSetApiKey={chat.setApiKey}
      keyConfigured={chat.keyConfigured}
      orgProfile={chat.orgProfile}
      credits={chat.personalCredits}
      creditsResetIso={chat.personalSub?.currentPeriodEnd}
      canPitchSubscription={canPitchSubscription({
        sub: chat.personalSub,
        inOrg: !!chat.orgProfile,
      })}
      unavailableModels={chat.unavailableModels}
      scrollTarget={chat.scrollTarget}
      onScrolled={chat.clearScrollTarget}
      pendingAttachment={focused ? pending.attach : null}
      onPendingConsumed={() => pending.setAttach(null)}
      pendingCompetence={focused ? pending.competence : null}
      onCompetenceConsumed={() => pending.setCompetence(null)}
      pendingTarget={focused ? pending.target : null}
      onTargetConsumed={() => pending.setTarget(null)}
    />
  );
}
