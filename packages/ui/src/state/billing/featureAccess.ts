import { useSyncExternalStore } from "react";
import {
  FEATURE_ACCESS,
  featureAccessDefaults,
  featureSpec,
  type FeatureId,
} from "@openmasq/catalog";
import type { Section } from "../../types";

/**
 * ACCESS to the governable sections — the gate, and nothing else.
 *
 * The table (flag keys, defaults, `cutsUsage`) lives in `@openmasq/catalog`
 * (rule 9: the same string is typed in PostHog and read here). This module only
 * holds the session's RESOLVED value and offers it to the two kinds of callers:
 * the components (`useFeatureAccess`) and the pure modules of the send path
 * (`featureAccess` / `featureUsage`, a synchronous snapshot read).
 *
 * ══ THE DISTINCTION THAT CARRIES EVERYTHING ═══════════════════════════════════════════════
 *
 * **Closing an access does NOT cut the feature.** The Mémoire keeps
 * injecting into every send, being queryable by the model, and extracting
 * silently; the Bibliothèque keeps receiving files. Only the GATE
 * disappears — the inventory screen, its nav entry, its ⌘K result, its
 * deep link. Compétences is the only one whose closing also stops usage
 * (`cutsUsage`), because a pinned compétence would otherwise keep injecting its
 * prompt from a page that has become unreachable.
 *
 * This is counter-intuitive, so it is TESTED both ways
 * (`featureAccess.test.ts`): memory access closed ⇒ `featureUsage("memory")` stays
 * true. Whoever reads "memory disabled" later and wants to cut
 * `selectMemory` will make this test fail, and it will tell them why.
 *
 * ⚠️ **None of these flags is a guard** (rule 7). The worst they do is
 * show or hide a screen; redaction, allow-lists and the write
 * gates are never steered from the network. The practical corollary: an
 * unreachable relay makes `featureAccess` fall back to the COMPILED DEFAULT ("the product
 * as shipped"), never "closed" — otherwise a network outage would strip three sections
 * from the whole fleet.
 */

/** Compile-time proof that every governable id IS a section of the app.
 *  `@openmasq/catalog` doesn't know `Section` (the UI depends on the catalogue, never
 *  the reverse): the correspondence is therefore checked here, and an entry added there
 *  with no section here fails to compile. */
type GatedIsSection = FeatureId extends Section ? true : never;
const _gatedIsSection: GatedIsSection = true;
void _gatedIsSection;

let resolved: Record<FeatureId, boolean> = featureAccessDefaults();
/** STABLE snapshot for `useSyncExternalStore`: returning a fresh object on every
 *  read would loop React. It's only replaced on an actual change. */
let snapshot: Record<FeatureId, boolean> = resolved;
const listeners = new Set<() => void>();

/**
 * Publish the resolved accesses (the flag client pushes them at startup, then on
 * every refresh). Tolerant by construction: an unknown key is ignored
 * and a non-boolean value leaves the default in place — a server's answer
 * doesn't have to be taken on faith to decide what the app displays.
 */
export function setFeatureAccess(next: Partial<Record<FeatureId, boolean>>): void {
  let changed = false;
  const merged = { ...resolved };
  for (const spec of FEATURE_ACCESS) {
    const v = next[spec.id];
    if (typeof v !== "boolean" || v === merged[spec.id]) continue;
    merged[spec.id] = v;
    changed = true;
  }
  if (!changed) return;
  resolved = merged;
  snapshot = merged;
  for (const l of listeners) l();
}

/**
 * Translate a PostHog response ("key → value") into access.
 *
 * ⚠️ The flags say **HIDE**, not "allow" — `access = !hidden` — and an
 * ABSENT key means "not hidden". This isn't tolerance, it's the core of the
 * mechanism: PostHog OMITS a disabled flag instead of setting it to `false`
 * (measured), so "never created", "disabled" and "unreachable" all
 * fall back to OPEN. The full reasoning is in `@openmasq/catalog` `flags.ts` — don't
 * re-invert the polarity without re-reading it.
 *
 * A flag can also hold a VARIANT (string): only a boolean gate makes
 * sense here, so a variant leaves the value in place rather than inventing a state.
 */
export function setFeatureAccessFromFlags(flags: Record<string, unknown>): void {
  const answered: Record<string, unknown> = flags && typeof flags === "object" ? flags : {};
  const next: Partial<Record<FeatureId, boolean>> = {};
  for (const spec of FEATURE_ACCESS) {
    const value = answered[spec.hideFlag];
    if (value === undefined) next[spec.id] = true; // absent ⇒ not hidden ⇒ open
    else if (typeof value === "boolean") next[spec.id] = !value;
  }
  setFeatureAccess(next);
}

/** Tests only: revert to the compiled defaults. */
export function __resetFeatureAccess(): void {
  resolved = featureAccessDefaults();
  snapshot = resolved;
  for (const l of listeners) l();
}

/** Is the GATE open? (screen, nav entry, ⌘K, deep link) */
export function featureAccess(id: FeatureId): boolean {
  return resolved[id];
}

/**
 * Can the feature be USED? True as long as the gate is open —
 * and true EVEN WITH THE GATE CLOSED for those that keep running (`cutsUsage:
 * false`). See the header: it's half of the mechanism, not a shortcut.
 */
export function featureUsage(id: FeatureId): boolean {
  return resolved[id] || !featureSpec(id).cutsUsage;
}

/** The sections to mount: everything that isn't governed, plus the open gates. */
export function enabledSections(all: readonly Section[]): Section[] {
  return all.filter((s) => !isGated(s) || featureAccess(s));
}

/** `true` if this section has a gate (so if `featureAccess` concerns it). */
export function isGated(s: Section): s is FeatureId {
  return FEATURE_ACCESS.some((f) => f.id === s);
}

/** The section to show when the one targeted is closed — never a dead end.
 *  Used at boot (a persisted section may have been closed since) AND in flight
 *  (a flag can flip while on the screen). */
export function sectionOrFallback(s: Section): Section {
  return isGated(s) && !featureAccess(s) ? "chats" : s;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The accesses, reactive. Components read THIS; the pure modules of the send
 *  path read `featureAccess`/`featureUsage` (no React over there). */
export function useFeatureAccess(): Record<FeatureId, boolean> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
