import type { Skill } from "../types";

/**
 * THE MIGRATION OF THE OLD « WORKFLOWS » LIST.
 *
 * The two lists were the same object down to the field; only one remains. This file
 * is what makes sure nobody notices by losing something: when loading
 * a settings blob written by an earlier version, `Settings.workflows` is poured
 * into `Settings.competences` and then erased.
 *
 * Three things hold, and each breaks something visible if forgotten:
 *
 * 1. **The ids are kept.** A composer chip, a deep link, a message
 *    tag and a `uses` point to them; minting new ones would turn all of
 *    history into dead references.
 * 2. **The order** — compétences first then routines — and the sort by date stays at
 *    render time — a list that reorders itself on first launch reads like
 *    data loss.
 * 3. **Idempotent BY REFERENCE.** With nothing to migrate, the SAME list comes back, so
 *    loading writes no state and doesn't relaunch persistence in a loop.
 */

/** The category an ex-workflow lands in: the word people had, demoted from a
 *  section to a category (`COMPETENCE_CATEGORIES`). */
const ROUTINE_CAT = "routine" as const;

/** Normalizes an entry from the old list into a compétence. A workflow had no
 *  category — it becomes a « Routine ». Its connector list is kept as-
 *  is: it's what carried all the behavior, and an empty list is erased so
 *  that the field stays the test for "drives tools". */
export function workflowToSkill(wf: Skill): Skill {
  const servers = [...new Set(wf.servers ?? [])];
  const { servers: _drop, ...rest } = wf;
  return {
    ...rest,
    cat: wf.cat ?? ROUTINE_CAT,
    ...(servers.length ? { servers } : {}),
  };
}

/**
 * Merges the old list into the new one. An entry whose id is ALREADY present is
 * ignored (a replayed migration, a synced blob carrying both) — otherwise
 * reopening the app would duplicate the list every time.
 *
 * Returns `null` when there's nothing to do, so the caller can skip the write.
 */
export function mergeLegacyWorkflows(
  skills: readonly Skill[] | undefined,
  workflows: readonly Skill[] | undefined,
): Skill[] | null {
  if (!workflows?.length) return null;
  const seen = new Set((skills ?? []).map((c) => c.id));
  const migrated = workflows.filter((w) => w?.id && !seen.has(w.id)).map(workflowToSkill);
  if (!migrated.length) return null;
  return [...(skills ?? []), ...migrated];
}
