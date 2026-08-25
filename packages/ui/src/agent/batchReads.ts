/**
 * **Reading one target at a time is the expensive way to read.**
 *
 * The loop already dispatches a turn's independent read-only calls IN PARALLEL, and the
 * system prompt asks for them together — but a weak model emits one per turn anyway. It
 * read eight Slack channels across eight turns: eight model calls where one would have
 * done, which is what spent a daily quota (journal du 02/08/2026).
 *
 * So the pattern is detected and told AT the moment it appears, in the tool result the
 * model is about to read — the same place, and the same reason, as `argErrorHint`: a
 * hint that arrives with the evidence works where one buried in a 19 000-character
 * system prompt does not. Pure; the loop only keeps the streak it returns.
 */

/** The streak of consecutive turns that called ONE read tool, alone — and whether it has
 *  been told. The flag rides HERE so a new streak cannot inherit the old one's silence. */
export interface SoloReadStreak {
  tool: string;
  count: number;
  told?: boolean;
}

/** How many consecutive solo calls before the nudge fires. Two is the first point at
 *  which the pattern is established AND there is still something to save: one wasted
 *  round-trip to be sure of it, every one after it spared. */
export const BATCH_READ_NUDGE_AT = 2;

/**
 * Advance the streak with this turn's calls. A turn that emitted anything but exactly
 * ONE call breaks it — batching is precisely what we are looking for, so a turn that
 * already batches must never be nudged.
 */
export function advanceSoloRead(
  prev: SoloReadStreak | null,
  calls: readonly { name: string }[],
): SoloReadStreak | null {
  if (calls.length !== 1) return null;
  const tool = calls[0]!.name;
  return prev && prev.tool === tool
    ? { tool, count: prev.count + 1, ...(prev.told ? { told: true } : {}) }
    : { tool, count: 1 };
}

/** Should this streak be told? Fires ONCE per streak — a model that ignored the hint
 *  will not be convinced by repeating it, and a repeated note is noise in the context. */
export function shouldNudgeBatch(streak: SoloReadStreak | null): boolean {
  return !!streak && !streak.told && streak.count >= BATCH_READ_NUDGE_AT;
}

/** The note itself. Names the TOOL and nothing else — no argument value ever rides it. */
export function batchReadNudge(tool: string, times: number): string {
  return (
    `\n\n(Note : tu as appelé \`${tool}\` ${times} fois de suite, une cible à la fois. ` +
    `Ces lectures sont INDÉPENDANTES : émets TOUS les appels restants ENSEMBLE dans ta ` +
    `prochaine réponse — ils s'exécutent en parallèle, en un seul tour au lieu d'un par cible.)`
  );
}
