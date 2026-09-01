import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findModel } from "@openmasq/llm";
import type { Conversation } from "../../types";
import { findModelAny } from "../../prompt/models";
import { DotsIcon, EditIcon, IconButton, ModelLogo, TrashIcon } from "../../components/brand";
import { CONV_TITLE_MAX } from "../../state/conversation/renameConversation";
import { usePopover } from "../../hooks/usePopover";
import { useT } from "../../i18n";
import { relTime } from "../../hooks/conversationGroups";

/**
 * One conversation in the sidebar list, with its hover actions.
 *
 * Extracted from `Sidebar` rather than grown inside it: a row that owns a menu, an
 * inline edit and their dismissal is a component, and the list itself has no business
 * holding per-row state.
 *
 * **Renaming is INLINE, not a modal.** The reference apps this was asked to match
 * (ChatGPT, Claude) edit in place, and a modal here would have to be a promoted shared
 * prompt — `Library`'s lives under `pages/`, which a container may not import from.
 * Deleting keeps its confirmation, because it is the one action that destroys data;
 * that dialog belongs to the LIST (one dialog for every row, not one per row).
 */
export function ConvRow({
  conv,
  active,
  onSelect,
  onRename,
  onAskDelete,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
  /** Absent ⇒ no rename item (a host/platform that can't persist it). */
  onRename?: (title: string) => void;
  /** Absent ⇒ no delete item. */
  onAskDelete?: () => void;
}) {
  const t = useT();
  const model = findModelAny(conv.modelId) ?? findModel(conv.modelId);
  // The popover's trigger ref rides the WRAPPER, not the button: `IconButton` forwards
  // no ref, and the wrapper's rect is the button's anyway (it wraps it exactly). The
  // outside-click test consults the trigger too, so a click on the wrapper still reads
  // as "inside" and the button toggles instead of reopening.
  const menu = usePopover<HTMLSpanElement, HTMLDivElement>({
    anchor: { align: "right", width: 200, desiredHeight: 96 },
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startRename = () => {
    menu.close();
    setDraft(conv.title || "");
    setEditing(true);
  };

  // Commit on Enter AND on blur — clicking away is how most people finish a rename,
  // and treating it as a cancel silently throws the typing away. `renameConversation`
  // already refuses an empty title, so a cleared field keeps the current one.
  const commit = () => {
    setEditing(false);
    onRename?.(draft);
  };

  const hasActions = !!onRename || !!onAskDelete;

  return (
    // A row is an OPTION of the sidebar's `role="listbox"` (`Sidebar`'s `.conv-list`),
    // not a <button>: it legally contains the ⋯ IconButton and the inline rename
    // <input>, which a native button may not nest. Keyboard: the row itself is
    // focusable (the global `:focus-visible` ring applies) and Enter/Space select —
    // guarded on `e.target === e.currentTarget` so a key pressed ON the ⋯ button or
    // in the rename field never doubles as a row selection.
    <div
      className={`conv-item om-sweep-host ${active ? "active" : ""}${editing ? " editing" : ""}`}
      role="option"
      aria-selected={active}
      tabIndex={0}
      onClick={() => !editing && onSelect()}
      onKeyDown={(e) => {
        if (editing || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {model && <ModelLogo provider={model.provider} modelId={model.id} size={15} />}
      {editing ? (
        <input
          ref={inputRef}
          className="conv-title-edit flex-min"
          autoFocus
          value={draft}
          maxLength={CONV_TITLE_MAX}
          aria-label={t.chat.renameConversation}
          // The row's own onClick selects the conversation; a click INSIDE the field
          // (to place the caret) would otherwise navigate away mid-rename.
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="conv-title flex-min">
          <span className="om-sweep">{conv.title || t.chrome.untitledConversation}</span>
        </span>
      )}
      {!editing && <span className="conv-time">{relTime(conv.updatedAt, t)}</span>}
      {hasActions && !editing && (
        <span
          className="conv-actions"
          ref={menu.triggerRef}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            size="sm"
            label={t.chat.rowActions}
            active={menu.open}
            expanded={menu.open}
            haspopup="menu"
            onClick={menu.toggle}
          >
            <DotsIcon size={15} />
          </IconButton>
        </span>
      )}
      {/* Portaled + fixed: `.conv-list` scrolls and clips, so an in-flow menu on the
          last visible row would be cut in half. `style` is null for the frame before
          placement is measured — rendering then would flash it at (0,0). */}
      {menu.open &&
        menu.style &&
        createPortal(
          <div
            ref={menu.menuRef}
            className="header-menu"
            role="menu"
            style={menu.style}
            onClick={(e) => e.stopPropagation()}
          >
            {onRename && (
              <button className="header-menu-item" role="menuitem" onClick={startRename}>
                <EditIcon size={15} />
                {t.chat.rename}
              </button>
            )}
            {onAskDelete && (
              <button
                className="header-menu-item danger"
                role="menuitem"
                onClick={() => {
                  menu.close();
                  onAskDelete();
                }}
              >
                <TrashIcon size={15} />
                {t.chrome.deleteConversationAction}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
