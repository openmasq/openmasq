import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { Skill, Settings } from "../types";
import { makeSkill, pinnedSkills, restoreSkillList } from "../skills/skills";

/**
 * The COMPÉTENCES CRUD — reusable prompts the user authors and uses in a chat.
 *
 * ⚠️ **ONE list only.** The « workflows » used to have a twin hook, identical down to the
 * comment, on a second `Settings` field; they became Compétences that carry
 * `servers`. Picking up the old field is `competences/migrate.ts`, applied by
 * `normalizeSettings` — this hook, itself, knows only one list.
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
export interface SkillsApi {
  skills: Skill[];
  /** Pinned, most-used first — the sidebar's one-click list. */
  pinned: Skill[];
  /** Create from user input. Returns the new entry, or null if it was empty. */
  addSkill: (input: { name: string; prompt: string; desc?: string; cat?: string; servers?: string[] }) => Skill | null;
  /** Patch an entry (rename, re-file, edit the prompt). */
  updateSkill: (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => void;
  removeSkill: (id: string) => void;
  /** Reinsert a just-deleted entry VERBATIM (same id, so chips/deep-links to it keep
   *  resolving) — the "Annuler" of a delete. A plain add would mint a new id. */
  restoreSkill: (c: Skill) => void;
  toggleSkillPin: (id: string) => void;
  /** Count one insertion — drives ordering + the "utilisée N fois" hint. */
  markSkillUsed: (id: string) => void;
}

export function useSkills(
  settings: Settings,
  setSettings: Dispatch<SetStateAction<Settings>>,
): SkillsApi {
  const skills = useMemo(() => settings.competences ?? [], [settings.competences]);
  const pinned = useMemo(() => pinnedSkills(skills), [skills]);

  // Every mutation goes through setSettings so it lands on the SAME persistence
  // path as the rest of settings — never a separate store field.
  const addSkill = useCallback(
    (input: { name: string; prompt: string; desc?: string; cat?: string; servers?: string[] }): Skill | null => {
      const entry = makeSkill(input);
      if (!entry) return null;
      setSettings((s) => ({ ...s, competences: [entry, ...(s.competences ?? [])] }));
      return entry;
    },
    [setSettings],
  );

  const updateSkill = useCallback(
    (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => {
      setSettings((s) => ({
        ...s,
        competences: (s.competences ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [setSettings],
  );

  const removeSkill = useCallback(
    (id: string) => {
      setSettings((s) => ({ ...s, competences: (s.competences ?? []).filter((c) => c.id !== id) }));
    },
    [setSettings],
  );

  const restoreSkill = useCallback(
    (c: Skill) => {
      setSettings((s) => {
        const cur = s.competences ?? [];
        const next = restoreSkillList(cur, c);
        // Same reference back = already present (double-fired undo) → no state write.
        return next === cur ? s : { ...s, competences: next as Skill[] };
      });
    },
    [setSettings],
  );

  const toggleSkillPin = useCallback(
    (id: string) => {
      setSettings((s) => ({
        ...s,
        competences: (s.competences ?? []).map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
      }));
    },
    [setSettings],
  );

  const markSkillUsed = useCallback(
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
    skills,
    pinned,
    addSkill,
    updateSkill,
    removeSkill,
    restoreSkill,
    toggleSkillPin,
    markSkillUsed,
  };
}
