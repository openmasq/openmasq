import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "../../components/feedback/ConfirmDialog";
import { RedactionRulesModal, DebugLogModal } from "../../containers/modals";
import { IconButton, SidebarIcon, ChevLeftIcon, DotsIcon } from "../../components/brand";
import type { Conversation, Settings } from "../../types";
import { usePopover } from "../../hooks/usePopover";
import { ConvTabs, type ConvTab } from "./ConvTabs";
import { HeaderMenu } from "./HeaderMenu";

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
  onToggleNeutralMarks,
  protectedCount,
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
  /** Ouvrir le comparatif « ce que le modèle a vu ». La modale vit dans `ChatView`, qui
   *  porte aussi l'encart qui l'ouvre — le menu ne fait que la déclencher. */
  onOpenTransparency?: () => void;
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  /** Set this conversation's per-chat category override (sparse). */
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  /** « Sans mémoire dans cette conversation » (rang de la modale de règles). */
  onSetMemoryOff?: (id: string, off: boolean) => void;
  /** Toggle this conversation's NEUTRAL-MARKS display mode (badge + hover highlight). */
  onToggleNeutralMarks?: (id: string) => void;
  protectedCount: number;
  onOpenSettings: () => void;
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
          <IconButton size="sm" label="Retour aux conversations" onClick={onBack}>
            <ChevLeftIcon size={18} />
          </IconButton>
        ) : (
          onToggleSidebar && (
            <IconButton size="sm" label="Basculer la barre latérale" onClick={onToggleSidebar}>
              <SidebarIcon size={18} />
            </IconButton>
          )
        )}
        {/* MOBILE (onBack): the kit's centered title + model line replaces the tabs —
            one thread on screen, navigation happens in the chat LIST screen. */}
        {onBack ? (
          <div className="chat-title-mobile">
            <div className="chat-title-mobile-name">
              {conversation?.title || "Nouvelle conversation"}
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
              label="Plus"
              active={menuOpen}
              onClick={toggleMenu}
            >
              <DotsIcon size={18} />
            </IconButton>
            {menuOpen && (
              <HeaderMenu
                protectedCount={protectedCount}
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
            title="Supprimer la conversation ?"
            message="Cette conversation et ses messages seront définitivement supprimés. Cette action est irréversible."
            confirmLabel="Supprimer la conversation"
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
