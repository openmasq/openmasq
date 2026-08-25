import { useEffect, useMemo, useRef, useState } from "react";
import { freshCardIds } from "../../memory";
import { duplicateSuggestions, pairKey, type MergeSuggestion } from "../../memory/dedupe";
import type { MemoryCard, MemoryData } from "../../types";

/**
 * The « À revoir » inbox + the delete safety net — the review-flow LOGIC, peeled out
 * of `MemoryView` (300-LOC cap, rule 1). The inbox empties by TREATING: Confirmer /
 * an edit from the panel stamps `reviewedAt` (`freshCardIds` excludes treated cards),
 * merging or deleting removes the item; the chip counts fresh cards + pending
 * duplicate suggestions. Deleting keeps the card aside a few seconds so « Annuler »
 * reinserts it VERBATIM (same id, history included).
 */
export function useMemoryReview(
  memoire: MemoryData,
  semEdges: { a: string; b: string; sim: number }[] | null,
  ops: {
    onUpdate: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
    onRemove: (id: string) => void;
    onRestore?: (card: MemoryCard) => void;
    onMerge?: (keepId: string, dropId: string) => void;
  },
) {
  const [fresh, setFresh] = useState(false);
  const freshIds = useMemo(() => freshCardIds(memoire, Date.now()), [memoire]);

  // Duplicate suggestions (surface match + semantic ≥0.95 when the on-device index is
  // present). SESSION-dismissed only — a page revisit may re-ask; persisting dismissals
  // isn't worth a schema field yet.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const mergeHints = useMemo<MergeSuggestion[]>(() => {
    if (!ops.onMerge) return [];
    return duplicateSuggestions(memoire.cards, semEdges ?? []).filter(
      (s) => !dismissed.has(pairKey(s.keepId, s.dropId)),
    );
  }, [memoire.cards, semEdges, dismissed, ops.onMerge]);
  const mergeHint = mergeHints[0] ?? null;
  const dismissMerge = (s: MergeSuggestion) =>
    setDismissed((d) => new Set([...d, pairKey(s.keepId, s.dropId)]));
  const reviewCount = freshIds.size + mergeHints.length;

  // « Confirmer » : lu et approuvé tel quel — la fiche sort de la boîte, rien d'autre.
  const confirmCard = (id: string) => ops.onUpdate(id, { reviewedAt: Date.now() });

  // Delete with a net: gone immediately, restorable while the toast lives.
  const [undo, setUndo] = useState<MemoryCard | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeWithUndo = (id: string) => {
    const card = memoire.cards.find((c) => c.id === id) ?? null;
    ops.onRemove(id);
    if (!card || !ops.onRestore) return;
    setUndo(card);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };
  const restoreUndo = () => {
    if (undo) ops.onRestore?.(undo);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  return {
    fresh,
    setFresh,
    freshIds,
    reviewCount,
    mergeHint,
    dismissMerge,
    confirmCard,
    removeWithUndo,
    undo,
    restoreUndo,
  };
}
