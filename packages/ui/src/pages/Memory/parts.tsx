import { DotsIcon, DownloadIcon, IconButton } from "../../components/brand";
import { usePopover } from "../../hooks/usePopover";
import { useT } from "../../i18n";
import type { MergeSuggestion } from "../../memory/dedupe";
import type { MemoryCard } from "../../types";

/** Small page chrome peeled out of `MemoryView` (300-LOC cap, rule 1): the header's
 *  ⋯ menu, the duplicate-merge card and the delete-undo toast. Presentation only. */

/** The page's ⋯ menu — the diagnostic export lives here, not beside the primary
 *  action: it is a debug artifact (real data, local file), not a daily gesture. */
export function MemoryPageMenu({ onExport }: { onExport: () => void }) {
  const t = useT();
  const { open, toggle, close, triggerRef, menuRef } = usePopover<HTMLDivElement, HTMLDivElement>();
  return (
    <div className="menu-anchor" ref={triggerRef}>
      <IconButton label={t.menus.page.moreActions} size="sm" active={open} onClick={toggle}>
        <DotsIcon size={17} />
      </IconButton>
      {open && (
        <div className="header-menu" ref={menuRef}>
          <button
            className="header-menu-item"
            onClick={() => {
              close();
              onExport();
            }}
            title={t.menus.page.exportMemoryTip}
          >
            <DownloadIcon size={15} /> {t.menus.page.exportMemory}
          </button>
        </div>
      )}
    </div>
  );
}

/** The duplicate suggestion — lives IN the « À revoir » inbox (counted in its chip,
 *  shown under its filter), never a banner that pushes the page down on every visit. */
export function MemoryMergeHint({
  hint,
  cardOf,
  onMerge,
  onDismiss,
}: {
  hint: MergeSuggestion;
  cardOf: (id: string) => MemoryCard | undefined;
  onMerge: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="om-mem-merge" role="note">
      <span className="om-mem-merge-text">
        Doublon probable&nbsp;: <strong>{cardOf(hint.keepId)?.entity}</strong> et{" "}
        <strong>{cardOf(hint.dropId)?.entity}</strong> semblent décrire la même entité
        {hint.reason === "semantic" ? t.lists.memory.mergeSemantic : ""}. La fusion garde tous les
        faits et l'ancien nom en alias.
      </span>
      <button type="button" className="btn-primary btn-inline" onClick={onMerge}>
        {t.lists.memory.merge}
      </button>
      <button type="button" className="btn-ghost btn-inline" onClick={onDismiss}>
        {t.lists.memory.dismiss}
      </button>
    </div>
  );
}

/** The delete safety net — « Annuler » reinserts the card VERBATIM (same id, history
 *  included) while the toast lives. */
export function MemoryUndoToast({ undo, onRestore }: { undo: MemoryCard; onRestore: () => void }) {
  const t = useT();
  return (
    <div className="om-mem-undo" role="status">
      <span>
        Fiche « <strong>{undo.entity}</strong> » supprimée.
      </span>
      <button type="button" className="btn-ghost btn-inline" onClick={onRestore}>
        {t.lists.memory.undo}
      </button>
    </div>
  );
}
