import type { Settings } from "../../types";
import type { Attachment } from "./Composer";
import { redactEngineSig } from "./redactEngineSig";

/** A value the user FORCES redacted (the Coffre ⊕ the conversation's manual redactions). */
export interface ForcedValue {
  value: string;
}

/**
 * The drop-time redaction of the given text-fold files, keyed by name, for the send to
 * REUSE (skip re-detecting the document). Only included when the file's redaction is
 * engine/category-CURRENT (its stamped `redactEngineSig` matches the current settings +
 * the org's mandated categories).
 *
 * SECURITY (rule 7 — never under-redact). Reuse means the send NEVER re-detects the
 * document, so anything the drop-time pass missed is shipped in clear. It is therefore
 * withheld whenever the drop-time map could be LOOSER than what this send must apply:
 *  - the conversation has a category OVERRIDE (it could be STRICTER than the file's
 *    global-settings drop-time pass);
 *  - a FORCED value (a Coffre term / a manual "Redact") occurs in the file's text.
 *    The drop-time document pass applies no `forced` list, so it cannot have redacted a
 *    Coffre term — and `sendForcedList` filters against `modelText`, which EXCLUDES reused
 *    documents, so the term was dropped from the send's `forced` list too. The Coffre's
 *    contract is "always redacted, every send, every conversation", so this must re-detect
 *    (the file then lands in `modelText`, the forced list keeps it, and `pseudonymize`
 *    applies it). Matched case-insensitively, like the engine's own `isKept`.
 * Pure + unit-tested.
 */
export function reusableDocReplacements(
  list: Attachment[],
  conversationRedactCategories: Record<string, boolean> | undefined,
  settings: Settings | undefined,
  forced: ForcedValue[] | undefined,
  orgForcedCategories?: string[],
): Record<string, { real: string; fake: string; tone: string }[]> {
  if (conversationRedactCategories && Object.keys(conversationRedactCategories).length) return {};
  const cur = redactEngineSig(settings, orgForcedCategories, conversationRedactCategories);
  const forcedLc = (forced ?? []).map((f) => f.value?.toLowerCase()).filter(Boolean) as string[];
  const out: Record<string, { real: string; fake: string; tone: string }[]> = {};
  for (const a of list) {
    if (!a.replacements?.length || a.redactEngineSig !== cur) continue;
    const textLc = (a.text ?? "").toLowerCase();
    if (forcedLc.some((v) => textLc.includes(v))) continue; // re-detect: see SECURITY above
    out[a.name] = a.replacements;
  }
  return out;
}
