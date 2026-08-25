import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { MemoryCard, MemoryData, Settings } from "../types";
import { MAX_PROFILE_CHARS, emptyMemory, makeMemoryCard } from "../memory";
import { autoCleanMemory, mergeCards } from "../memory/dedupe";

/**
 * The MÉMOIRE CRUD — durable cross-conversation facts (global profile + entity cards).
 * Mirrors `useCompetences.ts`: its own hook (store.ts is LOC-frozen), storage as a
 * `Settings` field so it inherits the settings persistence — localStorage + the
 * debounced encrypted Host DB — and is STRIPPED from the plaintext snapshot when a DB
 * exists (`storePersistence.ts`): this list is real PII, the coffre's at-rest regime.
 */
export interface MemoryApi {
  memoire: MemoryData;
  setMemoryProfile: (profile: string) => void;
  addMemoryCard: (input: { entity: string; facts: string; cat?: string; aliases?: string[] }) => MemoryCard | null;
  updateMemoryCard: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
  removeMemoryCard: (id: string) => void;
  /** Reinsert a just-deleted card VERBATIM (same id) — the "Annuler" of a delete. */
  restoreMemoryCard: (c: MemoryCard) => void;
  /** Confirmed duplicate merge (`memory/dedupe.ts` `mergeCards` — data-preserving:
   *  facts merged, the dropped entity/aliases kept as aliases). No-op on unknown ids. */
  mergeMemoryCards: (keepId: string, dropId: string) => void;
}

export function useMemoryStore(
  settings: Settings,
  setSettings: Dispatch<SetStateAction<Settings>>,
): MemoryApi {
  const memoire = useMemo(() => settings.memoire ?? emptyMemory(), [settings.memoire]);

  const patch = useCallback(
    (fn: (m: MemoryData) => MemoryData) => {
      setSettings((s) => ({ ...s, memoire: fn(s.memoire ?? emptyMemory()) }));
    },
    [setSettings],
  );

  // SELF-HEALING: auto-clean the CERTAIN duplicates on every memory change — the
  // backlog of invented-title preference cards migrates to the profile, same-entity /
  // identical-note duplicates merge data-preservingly (`memory/dedupe.ts`
  // `autoCleanMemory`). Idempotent fixpoint, so this effect converges in ONE extra
  // render and never loops; duplicates arriving from any source (old extractions, a
  // device-sync list merge) heal the same way.
  useEffect(() => {
    if (!autoCleanMemory(memoire).changed) return;
    patch((m) => autoCleanMemory(m).data);
  }, [memoire, patch]);

  const setMemoryProfile = useCallback(
    (profile: string) =>
      patch((m) => ({ ...m, profile: profile.trim().slice(0, MAX_PROFILE_CHARS) || undefined })),
    [patch],
  );

  const addMemoryCard = useCallback(
    (input: { entity: string; facts: string; cat?: string; aliases?: string[] }): MemoryCard | null => {
      const card = makeMemoryCard(input);
      if (!card) return null;
      patch((m) => ({ ...m, cards: [card, ...m.cards] }));
      return card;
    },
    [patch],
  );

  const updateMemoryCard = useCallback(
    (id: string, cardPatch: Partial<Omit<MemoryCard, "id" | "createdAt">>) =>
      patch((m) => {
        // A patch that carries `reviewedAt` (the review flow) gets it pinned to the
        // SAME instant as the `updatedAt` bump — two Date.now() calls can differ by a
        // millisecond, and `freshCardIds`'s « treated » test is `reviewedAt >= updatedAt`.
        const now = Date.now();
        return {
          ...m,
          cards: m.cards.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...cardPatch,
                  updatedAt: now,
                  ...(cardPatch.reviewedAt !== undefined ? { reviewedAt: now } : {}),
                }
              : c,
          ),
        };
      }),
    [patch],
  );

  const removeMemoryCard = useCallback(
    (id: string) => patch((m) => ({ ...m, cards: m.cards.filter((c) => c.id !== id) })),
    [patch],
  );

  const restoreMemoryCard = useCallback(
    (c: MemoryCard) => patch((m) => ({ ...m, cards: [c, ...m.cards.filter((x) => x.id !== c.id)] })),
    [patch],
  );

  const mergeMemoryCards = useCallback(
    (keepId: string, dropId: string) =>
      patch((m) => {
        const keep = m.cards.find((c) => c.id === keepId);
        const drop = m.cards.find((c) => c.id === dropId);
        if (!keep || !drop || keepId === dropId) return m;
        const merged = mergeCards(keep, drop);
        return { ...m, cards: m.cards.filter((c) => c.id !== dropId).map((c) => (c.id === keepId ? merged : c)) };
      }),
    [patch],
  );

  return {
    memoire,
    setMemoryProfile,
    addMemoryCard,
    updateMemoryCard,
    removeMemoryCard,
    restoreMemoryCard,
    mergeMemoryCards,
  };
}
