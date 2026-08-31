import type { Settings } from "../../types";

/**
 * The redaction engine SIGNATURE (engine + model + category toggles + numbers + the ORG's
 * mandated categories). It's stamped on an attachment when it's redacted, so the composer
 * chip can offer a re-run once the user switches the redaction engine/model/categories in
 * Settings — the file was redacted with the OLD signature, and the send won't reuse a
 * now-outdated map. A category change redacts a DIFFERENT set, so it must invalidate the
 * file too. Pure + unit-tested.
 *
 * ⚠️ `orgForced` and `convCategories` are part of the signature ON PURPOSE — same reason,
 * same shape. An org-MANDATED category the member has switched off globally, or a
 * per-conversation override, are both merged in by the send (`effectiveRedactCategories`)
 * and by the drop-time document pass — the SAME spread, pinned by `redactEngineSig.test.ts`
 * ("changes when a conversation override changes") and `redactionEngine.test.ts` (the
 * override beats the global default both ways). A file redacted under a different
 * conversation policy must therefore be STALE, or the send/chip would reuse a map built
 * for the WRONG set of categories. Reuse is what turns a documented over-redaction nicety
 * into a real leak.
 */
export function redactEngineSig(
  s?: Settings,
  orgForced?: string[],
  convCategories?: Record<string, boolean>,
): string {
  const engine =
    s?.redactEngine === "remote"
      ? "cloud (Scaleway)"
      : s?.redactEngine === "model"
        ? `IA (${s.redactProvider}${s.redactModelName ? ` · ${s.redactModelName}` : ""})`
        : s?.redactEngine === "local"
          ? "IA locale (BERT NER)"
          : "règles locales";
  // Include the CATEGORY toggles + numbers: a category change redacts a DIFFERENT set,
  // so a file redacted before it is stale (the chip offers "reredact") AND the send
  // won't reuse its now-outdated map — it re-detects instead.
  // The MODE (plausible fake ⇄ `[PERSON1]` marker) changes the very shape of the
  // substitutes, so a file redacted in the other mode is stale: without it, REUSING
  // its map would send fakes in the middle of a token-mode conversation — not a
  // leak (everything stays vaulted), but the model would read two vocabularies for a
  // single conversation. Same reason as the categories: reusing means freezing.
  // The conversation override is spread ON TOP of the global categories, same
  // precedence as `effectiveRedactCategories` — a conv-off category must change the
  // signature exactly like a globally-off one does above.
  const cats = `${JSON.stringify({ ...(s?.redactCategories ?? {}), ...(convCategories ?? {}) })}|${s?.redactNumbers ? "n" : ""}${s?.redactWireTokens ? "|jetons" : ""}`;
  // Sorted so the signature is stable across profile refreshes that reorder the list.
  // Appended ONLY when the user is in an org with mandated categories, so a solo user's
  // signature is byte-identical to before this field existed (no needless staleness).
  const org = orgForced?.length ? [...orgForced].sort().join(",") : "";
  return org ? `${engine}#${cats}#${org}` : `${engine}#${cats}`;
}
