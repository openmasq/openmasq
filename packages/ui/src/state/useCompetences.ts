import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { Competence, Settings } from "../types";
import { makeCompetence, pinnedCompetences, restoreCompetenceList } from "../competences/competences";

/**
 * The COMPÉTENCES CRUD — reusable prompts the user authors and uses in a chat.
 *
 * ⚠️ **Une seule liste.** Les « workflows » avaient leur hook jumeau, identique au
 * commentaire près, sur un second champ de `Settings` ; ils sont devenus des compétences
 * qui portent des `servers`. La reprise de l'ancien champ est `competences/migrate.ts`,
 * appliquée par `normalizeSettings` — ce hook, lui, ne connaît qu'une liste.
 *
 * Its own hook rather than a fifth block inside `store.ts`: that file is the
 * biggest in the repo and frozen in the LOC allowlist, and `state/CLAUDE.md`
 * explicitly names the coffre CRUD (the analogous list) as a wanted peel. So this
 * one starts outside.
 *
 * Storage is the coffre's path exactly: a `Settings` field, so it inherits the
 * settings persistence for free — localStorage + the debounced encrypted Host DB
 * ("DB wins" on load) — and is stripped from the plaintext localStorage snapshot
 * when a DB exists (see `storePersistence.ts`). Cross-device: the apps sync the
 * list E2E-encrypted on the `@userdata` record scope (`@openmasq/sync`
 * `userdata.ts` — desktop/mobile `useUserdataSync`); this hook stays sync-blind.
 */
export interface CompetencesApi {
  competences: Competence[];
  /** Pinned, most-used first — the sidebar's one-click list. */
  pinned: Competence[];
  /** Create from user input. Returns the new entry, or null if it was empty. */
  addCompetence: (input: { name: string; prompt: string; desc?: string; cat?: string; servers?: string[] }) => Competence | null;
  /** Patch an entry (rename, re-file, edit the prompt). */
  updateCompetence: (id: string, patch: Partial<Omit<Competence, "id" | "createdAt">>) => void;
  removeCompetence: (id: string) => void;
  /** Reinsert a just-deleted entry VERBATIM (same id, so chips/deep-links to it keep
   *  resolving) — the "Annuler" of a delete. A plain add would mint a new id. */
  restoreCompetence: (c: Competence) => void;
  toggleCompetencePin: (id: string) => void;
  /** Count one insertion — drives ordering + the "utilisée N fois" hint. */
  markCompetenceUsed: (id: string) => void;
}

export function useCompetences(
  settings: Settings,
  setSettings: Dispatch<SetStateAction<Settings>>,
): CompetencesApi {
  const competences = useMemo(() => settings.competences ?? [], [settings.competences]);
  const pinned = useMemo(() => pinnedCompetences(competences), [competences]);

  // Every mutation goes through setSettings so it lands on the SAME persistence
  // path as the rest of settings — never a separate store field.
  const addCompetence = useCallback(
    (input: { name: string; prompt: string; desc?: string; cat?: string; servers?: string[] }): Competence | null => {
      const entry = makeCompetence(input);
      if (!entry) return null;
      setSettings((s) => ({ ...s, competences: [entry, ...(s.competences ?? [])] }));
      return entry;
    },
    [setSettings],
  );

  const updateCompetence = useCallback(
    (id: string, patch: Partial<Omit<Competence, "id" | "createdAt">>) => {
      setSettings((s) => ({
        ...s,
        competences: (s.competences ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [setSettings],
  );

  const removeCompetence = useCallback(
    (id: string) => {
      setSettings((s) => ({ ...s, competences: (s.competences ?? []).filter((c) => c.id !== id) }));
    },
    [setSettings],
  );

  const restoreCompetence = useCallback(
    (c: Competence) => {
      setSettings((s) => {
        const cur = s.competences ?? [];
        const next = restoreCompetenceList(cur, c);
        // Same reference back = already present (double-fired undo) → no state write.
        return next === cur ? s : { ...s, competences: next as Competence[] };
      });
    },
    [setSettings],
  );

  const toggleCompetencePin = useCallback(
    (id: string) => {
      setSettings((s) => ({
        ...s,
        competences: (s.competences ?? []).map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
      }));
    },
    [setSettings],
  );

  const markCompetenceUsed = useCallback(
    (id: string) => {
      setSettings((s) => ({
        ...s,
        competences: (s.competences ?? []).map((c) =>
          c.id === id ? { ...c, uses: (c.uses ?? 0) + 1 } : c,
        ),
      }));
    },
    [setSettings],
  );

  return {
    competences,
    pinned,
    addCompetence,
    updateCompetence,
    removeCompetence,
    restoreCompetence,
    toggleCompetencePin,
    markCompetenceUsed,
  };
}
