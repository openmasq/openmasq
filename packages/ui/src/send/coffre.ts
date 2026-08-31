import type { Conversation, CoffreTerm } from "../types";
import { REDACT_TYPES, type RedactType } from "@openmasq/redact";

/**
 * Pure logic for the COFFRE — the user's dictionary of values ALWAYS redacted
 * (before every send, in every conversation, whatever the model). React-free, so
 * it's unit-testable and importable anywhere. The persistence + send wiring live
 * in `store.ts`; the page renders `coffreOccurrences`.
 */

/** The data-type vocabulary offered by the Coffre (same tokens the redaction engine
 *  emits, so a term gets a same-kind fake + the right highlight hue). */
export const COFFRE_TYPES: RedactType[] = REDACT_TYPES;

/** FR label for a token (falls back to the raw token). */
export function coffreTypeLabel(token: string): string {
  return REDACT_TYPES.find((t) => t.token === token)?.label ?? token;
}

/** Build a fresh Coffre entry. `id` prefers `crypto.randomUUID` (browser), else a
 *  time+random fallback. Trims the value; drops an empty note. */
export function makeCoffreTerm(value: string, token: string, note?: string): CoffreTerm {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cf_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  return { id, value: value.trim(), token, note: note?.trim() || undefined, createdAt: Date.now() };
}

/** Personal Coffre ⊕ the ORG Coffre — the enforcement set every consumer must
 *  use (rule 11: an org-mandated term is « toujours redacted » exactly like a
 *  personal one; forgetting the org half here would ship it in clear). One
 *  home, so a new call site can't merge only one of the two. */
export function combinedCoffre(
  s: { coffre?: CoffreTerm[]; orgCoffre?: CoffreTerm[] } | undefined,
): CoffreTerm[] {
  return [...(s?.coffre ?? []), ...(s?.orgCoffre ?? [])];
}

/** Map the Coffre to the send pipeline's `forced` shape (`{value, category}[]`),
 *  dropping blanks. These are merged HIGHEST-priority into every send's forced list. */
export function coffreToForced(coffre: CoffreTerm[] | undefined): { value: string; category: string }[] {
  return (coffre ?? []).filter((t) => t.value.trim()).map((t) => ({ value: t.value, category: t.token }));
}

/** True when a value already lives in the Coffre (case-insensitive, trimmed) — so the
 *  UI can avoid duplicate entries. */
export function coffreHasValue(coffre: CoffreTerm[] | undefined, value: string): boolean {
  const v = value.trim().toLowerCase();
  return !!v && (coffre ?? []).some((t) => t.value.trim().toLowerCase() === v);
}

export interface CoffreUse {
  convId: string;
  /** First message (in clear) where the value appears — the anchor to scroll to when
   *  the row is clicked. Undefined when the term is only present in the vault. */
  msgId?: string;
  title: string;
  modelId: string;
  updatedAt: number;
  count: number;
}
export interface CoffreOccurrences {
  uses: CoffreUse[];
  totalCount: number;
  convCount: number;
}

/** Count case-insensitive, overlapping-free occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  const ndl = needle.toLowerCase();
  let n = 0;
  let i = hay.indexOf(ndl);
  while (i !== -1) {
    n++;
    i = hay.indexOf(ndl, i + ndl.length);
  }
  return n;
}

/**
 * Where a Coffre term has actually been redacted — REAL data, computed from the
 * persisted conversations: a conversation "uses" the term when its value appears in
 * a message OR is present in the conversation vault (mapped back from its fake).
 * `count` = occurrences across message contents (floor 1 when only the vault holds
 * it). Sorted most-recent first. Powers the "N occ · N conv" pill + the uses modal.
 */
export function coffreOccurrences(term: CoffreTerm, conversations: Conversation[]): CoffreOccurrences {
  const value = term.value.trim();
  const valueLc = value.toLowerCase();
  const uses: CoffreUse[] = [];
  if (!value) return { uses, totalCount: 0, convCount: 0 };
  for (const c of conversations) {
    let count = 0;
    let msgId: string | undefined;
    for (const m of c.messages) {
      const n = countOccurrences(m.content ?? "", value);
      if (n > 0 && !msgId) msgId = m.id; // first in-clear hit = the scroll anchor
      count += n;
    }
    // CASE-INSENSITIVE comparison, like everything else in the Coffre (`coffreHasValue`,
    // `countOccurrences`, the send's `forced` list): the engine redacts « ACME2024 »
    // written as « acme2024 » and vaults the text's ACTUAL case, so a `===` on the
    // entered case reported « 0 conversations » for a term that was nonetheless masked everywhere.
    const inVault = c.redactionVault
      ? Object.values(c.redactionVault).some((v) => v.trim().toLowerCase() === valueLc)
      : false;
    if (count === 0 && !inVault) continue;
    uses.push({
      convId: c.id,
      msgId,
      title: c.title || "Sans titre",
      modelId: c.modelId ?? "",
      updatedAt: c.updatedAt ?? 0,
      count: Math.max(count, inVault ? 1 : 0),
    });
  }
  uses.sort((a, b) => b.updatedAt - a.updatedAt);
  const totalCount = uses.reduce((s, u) => s + u.count, 0);
  return { uses, totalCount, convCount: uses.length };
}
