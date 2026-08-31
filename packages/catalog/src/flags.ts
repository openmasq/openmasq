/**
 * The FOURTH governable list: access to sections that can be closed remotely
 * (PostHog flags, served by the `apps/analytics-fn` relay).
 *
 * It lives HERE, next to models / connectors / categories, for the same reason
 * as them: the flag key is written in PostHog by a human and read by the
 * product — two places that must name the SAME string, hence a single source
 * (rule 9). A flag hand-typed in a component is a flag that will
 * never turn off on the day it needs to.
 *
 * ══ WHY THE FLAG SAYS "HIDE", AND NEVER "ALLOW" ══════════════════
 *
 * Measured against real PostHog (17/08), and this is what decided the polarity:
 * **a DISABLED flag isn't rendered as `false` — it's ABSENT from the response.**
 * With an `access-*` key (true = open), the interface's « Disable » button — the
 * dashboard's most obvious gesture — therefore produced a response where the key
 * was missing, which the client reads as "no opinion": the door stayed wide open.
 * A lever that does nothing, silently.
 *
 * With `hide-*` (true = closed), the three ways of saying nothing all fall onto
 * the SAME safe value:
 *   • flag never created          → absent → `false` → open
 *   • flag disabled               → absent → `false` → open
 *   • PostHog / relay unreachable → absent → `false` → open
 * and the only gesture that closes is the one that reads as such: turning "hide" on
 * at 100%. The polarity isn't a taste — it's what makes fail-open structural
 * instead of depending on an instruction nobody re-reads.
 *
 * ⚠️ **These are INTERFACE doors, never guards.** The worst a flag
 * can do here is make a screen appear or disappear. None decides
 * what leaves the machine: redaction, allow-lists and write
 * confirmations aren't steered from the network (rule 7). Adding an entry whose
 * value would LOWER a protection is a contradiction — an unreachable relay
 * would become a guard being disabled.
 */

/** The features whose ACCESS is governable. Each id is also a section
 *  of the app (`Section` in `@openmasq/ui`) — the correspondence is verified there,
 *  this package doesn't know the UI's types. */
export type FeatureId = "memory" | "library" | "competences";

export interface FeatureAccessSpec {
  id: FeatureId;
  /** The EXACT flag key on the PostHog side. **True = HIDDEN** (see the header). */
  hideFlag: string;
  /**
   * `true` ⇒ closing access ALSO stops using the feature.
   *
   * This is the distinction that carries the whole mechanism. Mémoire and the Library
   * keep WORKING with the door closed — memory still gets injected, queried and
   * extracted as before, files keep arriving; only the
   * inventory screen disappears. Compétences, on the other hand, stop being staged:
   * no more "/" palette, no more pinned ones, no more model suggestion.
   */
  cutsUsage: boolean;
}

export const FEATURE_ACCESS: readonly FeatureAccessSpec[] = [
  { id: "memory", hideFlag: "hide-memory", cutsUsage: false },
  { id: "library", hideFlag: "hide-library", cutsUsage: false },
  { id: "competences", hideFlag: "hide-competences", cutsUsage: true },
] as const;

const BY_ID = new Map(FEATURE_ACCESS.map((f) => [f.id, f]));

export function featureSpec(id: FeatureId): FeatureAccessSpec {
  // Non-null: the table is exhaustive over `FeatureId` and `flags.test.ts` pins it.
  return BY_ID.get(id) as FeatureAccessSpec;
}

/** The starting state: **everything open**. The safe default is "the product as
 *  shipped", not "closed" — closing three sections over a network outage would be the
 *  real damage. A NEW feature shipped off for the duration of a
 *  progressive rollout isn't expressed here: it's simply not wired up yet. */
export function featureAccessDefaults(): Record<FeatureId, boolean> {
  return Object.fromEntries(FEATURE_ACCESS.map((f) => [f.id, true])) as Record<
    FeatureId,
    boolean
  >;
}

/** "hide" flag key → id, to read a PostHog response without rewriting the table. */
export function featureIdForHideFlag(flag: string): FeatureId | undefined {
  return FEATURE_ACCESS.find((f) => f.hideFlag === flag)?.id;
}
