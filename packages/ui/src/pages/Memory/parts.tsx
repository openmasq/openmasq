import { useT } from "../../i18n";
import { Toast } from "../../components/feedback/Toast";
import type { MergeSuggestion } from "../../memory/dedupe";
import type { MemoryCard } from "../../types";

/** Small page chrome peeled out of `MemoryView` (300-LOC cap, rule 1): the
 *  duplicate-merge card and the delete-undo toast. Presentation only. The diagnostic
 *  export is NOT page chrome any more — it is `MemoryExportRow`, in Réglages → Journal. */

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
        {t.lists.memory.mergeLead}
        <strong>{cardOf(hint.keepId)?.entity}</strong>
        {t.lists.memory.mergeJoin}
        <strong>{cardOf(hint.dropId)?.entity}</strong>
        {t.lists.memory.mergeTail}
        {hint.reason === "semantic" ? t.lists.memory.mergeSemantic : "."}
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
 *  included) while the toast lives. THE app toast (components/feedback/Toast): the
 *  timer is the toast's own, `onDone` is what clears the net. */
export function MemoryUndoToast({
  undo,
  onRestore,
  onDone,
}: { undo: MemoryCard; onRestore: () => void; onDone: () => void }) {
  const t = useT();
  return (
    <Toast
      tone="info"
      message={t.lists.memory.deleted(undo.entity)}
      duration={6000}
      onDone={onDone}
      action={{ label: t.lists.memory.undo, onClick: onRestore }}
    />
  );
}
