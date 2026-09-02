import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "../../components/feedback/ConfirmDialog";
import { RedactionRulesModal, DebugLogModal } from "../../containers/modals";
import { IconButton, SidebarIcon, ChevLeftIcon, DotsIcon } from "../../components/brand";
import type { Conversation, Settings } from "../../types";
import { usePopover } from "../../hooks/usePopover";
import { useT } from "../../i18n";
import { ConvTabs, type ConvTab } from "./ConvTabs";
import { HeaderMenu } from "./HeaderMenu";
import type { RedactLevelApi } from "./ComposerRedactMenu";

/**
 * The chat pane's unified top bar (`.chat-topbar`, per the refreshed design's
 * `.om-topbar`): sidebar toggle · the conversation TABS (`ConvTabs`, which used to
 * be a standalone strip in `AppShell`) · a flex spacer · the
 * marks-eye · the "protected" redaction pill · the more-menu — all in ONE non-floating
 * row at the top of the chat pane. Plus the modals those controls open (redaction
 * rules / debug / delete). Presentation + local UI state only.
 */
export function ChatHeader({
  onOpenTransparency,
  conversation,
  modelName,
  settings,
  onChangeSettings,
  onChangeConversation,
  onSetMemoryOff,
  protectedCount,
  redactLevel,
  onOpenSettings,
  onToggleSidebar,
  onBack,
  onDelete,
  showTabs = true,
  tabs,
  activeId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTabPointerDown,
  onSplitTab,
}: {
  conversation: Conversation | null;
  modelName?: string;
  /** Open the « ce que le modèle a vu » comparison. The modal lives in `ChatView`, which
   *  also carries the banner that opens it — the menu only triggers it. */
  onOpenTransparency?: () => void;
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  /** Set this conversation's per-chat category override (sparse). */
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  /** « Sans mémoire dans cette conversation » (a row in the rules modal). */
  onSetMemoryOff?: (id: string, off: boolean) => void;
  protectedCount: number;
  /** The level in force (from `redactLevelApi`), for the ⋯ entry's « modifié » tag. */
  redactLevel?: RedactLevelApi;
  /** Open Réglages, on a tab when one is named — the rules modal links to
   *  « Confidentialité » for the default level. */
  onOpenSettings: (tab?: string) => void;
  onToggleSidebar?: () => void;
  /** MOBILE: pop back to the chat list. When present the bar switches to the kit's
   *  mobile chat top bar — back chevron + centered title/model instead of the
   *  sidebar toggle + conversation tabs (one thread on screen at a time). */
  onBack?: () => void;
  onDelete?: () => void;
  /** Render the in-bar conversation TABS. Kept true in the tiling workspace too (the
   *  tabs live in this ONE bar per pane — no separate strip), false only where a
   *  caller wants an actions-only bar. */
  showTabs?: boolean;
  /** Open conversation TABS (in this bar). In the workspace these are the PANE's tabs. */
  tabs: ConvTab[];
  activeId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  /** Workspace: pointerdown on a tab starts the pointer-based move/split drag. */
  onTabPointerDown?: (id: string, e: import("react").PointerEvent) => void;
  onSplitTab?: (id: string, side: "left" | "right") => void;
}) {
  const t = useT();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  // Dismissal via `usePopover` (a document listener, so it is robust whatever the bar's
  // stacking / containing-block context).
  const {
    open: menuOpen,
    toggle: toggleMenu,
    close: closeMenu,
    triggerRef: menuRef,
  } = usePopover<HTMLDivElement, HTMLDivElement>();

  return (
    <>
      <div className="chat-topbar">
        {onBack ? (
          <IconButton size="sm" label={t.chat.backToConversations} onClick={onBack}>
            <ChevLeftIcon size={18} />
          </IconButton>
        ) : (
          onToggleSidebar && (
            <IconButton size="sm" label={t.chat.toggleSidebar} onClick={onToggleSidebar}>
              <SidebarIcon size={18} />
            </IconButton>
          )
        )}
        {/* MOBILE (onBack): the kit's centered title + model line replaces the tabs —
            one thread on screen, navigation happens in the chat LIST screen. */}
        {onBack ? (
          <div className="chat-title-mobile">
            <div className="chat-title-mobile-name">
              {conversation?.title || t.chrome.untitledConversation}
            </div>
            {modelName && <div className="chat-title-mobile-model">{modelName}</div>}
          </div>
        ) : showTabs ? (
          /* Conversation tabs (single-pane). Flex-grows so the action cluster is
             pushed to the right edge. In the tiling workspace the tabs live in each
             pane's `PaneTabs`, so a bare flex spacer keeps the actions right-aligned. */
          <ConvTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onNew={onNewTab}
            onTabPointerDown={onTabPointerDown}
            onSplitTab={onSplitTab}
          />
        ) : (
          <div className="chat-topbar-spacer" />
        )}
        {/* No browser toggle here: the agent browser is driven from the RIGHT RAIL's
            globe, which owns its tabs and its busy state. This bar carried a second,
            partial door to the same panel — it had already stopped being mounted. */}
        {conversation && (
          <div className="menu-anchor" ref={menuRef}>
            <IconButton
              size="sm"
              label={t.chat.more}
              active={menuOpen}
              onClick={toggleMenu}
            >
              <DotsIcon size={18} />
            </IconButton>
            {menuOpen && (
              <HeaderMenu
                protectedCount={protectedCount}
                redactLevel={redactLevel}
                settings={settings}
                onOpenRules={() => {
                  closeMenu();
                  if (settings && onChangeSettings) setRulesOpen(true);
                  else onOpenSettings();
                }}
                onOpenTransparency={() => {
                  closeMenu();
                  onOpenTransparency?.();
                }}
                onOpenDebug={() => {
                  closeMenu();
                  setDebugOpen(true);
                }}
                onAskDelete={
                  onDelete
                    ? () => {
                        closeMenu();
                        setConfirmDelete(true);
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {rulesOpen && settings && onChangeSettings && (
          <RedactionRulesModal
            settings={settings}
            onChange={onChangeSettings}
            conversation={conversation}
            onChangeConversation={
              conversation && onChangeConversation
                ? (cats) => onChangeConversation(conversation.id, cats)
                : undefined
            }
            onMemoryOff={
              conversation && onSetMemoryOff
                ? (off) => onSetMemoryOff(conversation.id, off)
                : undefined
            }
            // The default level is chosen in Réglages → Confidentialité; the modal
            // only links there (and closes, so the link is not a second modal).
            onOpenPrivacySettings={() => {
              setRulesOpen(false);
              onOpenSettings("privacy");
            }}
            onClose={() => setRulesOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {debugOpen && (
          <DebugLogModal onClose={() => setDebugOpen(false)} convId={conversation?.id ?? null} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && onDelete && (
          <ConfirmDialog
            title={t.chrome.deleteConversation}
            message={t.chrome.deleteConversationBody(
              conversation?.title || t.chrome.untitledConversation,
            )}
            confirmLabel={t.chrome.deleteConversationAction}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              setConfirmDelete(false);
              onDelete();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
