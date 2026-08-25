import { RULES } from "./rules";
import { redactionCategory } from "../kinds";

/**
 * Pure, deterministic "does this text look like it carries a CREDENTIAL?" scan,
 * for callers that want to SKIP the full redaction of a public-web result but
 * must fail closed when the page might be an authenticated one showing a real
 * key (a PAT page, a cloud console — the exact reason the browser's clear-list
 * is narrower than a search connector's, see `@openmasq/ui` BROWSER_CLEAR).
 *
 * Deliberately restricted to the DISTINCTIVE `secret` category (vendor-prefixed
 * keys, connection strings, private keys, `user:pass@` URLs) — NARROWER than
 * `CREDENTIAL_KINDS` (which also url-exempts the checksummed card/iban/id
 * categories): a public web page legitimately shows card-shaped numbers, and the
 * generic `apikey` heuristic matches CDN cache-busters and asset ids, i.e. the
 * noise every ordinary web page is full of. Including either would make the
 * scan fire on ~every page (a fail-closed check that always fires is a dead
 * feature, so it would get removed — keep it meaningful instead).
 */
let credRules: { pattern: RegExp; validate?: (m: string) => boolean }[] | null = null;

function rules(): { pattern: RegExp; validate?: (m: string) => boolean }[] {
  // Clone the regexes: RULES' patterns are global and shared with the engine —
  // leaving a dangling `lastIndex` behind would corrupt the next redaction pass.
  credRules ??= RULES.filter((r) => redactionCategory(r.type) === "secret").map((r) => ({
    pattern: new RegExp(r.pattern.source, r.pattern.flags),
    validate: r.validate,
  }));
  return credRules;
}

/** True when `text` contains at least one validated credential-shaped span. */
export function containsCredentialShaped(text: string): boolean {
  for (const rule of rules()) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      if (!rule.validate || rule.validate(m[0])) {
        rule.pattern.lastIndex = 0;
        return true;
      }
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  return false;
}
