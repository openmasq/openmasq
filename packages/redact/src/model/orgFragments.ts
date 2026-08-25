// Fake-COMPANY fragment protection for `pseudonymize`. A tool/search RESULT routinely
// echoes back only the DISTINCTIVE word of a fake company we issued ("Tyrell" out of
// the fake ORG "Tyrell Corp"). The NER re-detects that lone fragment as a fresh ORG
// and — unless we stop it — fakes it AGAIN ("Tyrell" → "Savary"), a fake-of-a-fake
// (the reported ORG "double redaction"). The whole-phrase and every-word-is-a-key
// guards in `pseudonymize` miss a bare fragment, so this recognises it explicitly.

// Generic company/legal tokens that are NOT distinctive — they appear in real names
// too ("… Corporation", "… Group"), so a fake ORG's distinctive word is everything
// EXCEPT these, and a fake key only counts as a "company" when it ENDS in one.
export const GENERIC_ORG_WORD = new Set([
  "corp", "corporation", "inc", "incorporated", "ltd", "limited", "llc", "co",
  "company", "group", "holding", "holdings", "sa", "sas", "sarl", "sasu", "gmbh",
  "ag", "plc", "llp", "&", "and", "the", "of",
  // Common company-TYPE suffixes (incl. the fake-org pool's) so a fake like
  // "Brantley Systems" still counts as a company and its distinctive word is caught.
  "labs", "works", "systems", "partners", "logistics", "industries", "solutions",
  "analytics", "technologies", "ventures", "capital", "consulting",
]);

/**
 * Distinctive words that belong to a MULTI-WORD fake COMPANY we already issued
 * (e.g. "Tyrell" from the fake ORG "Tyrell Corp"). Collects those words (capitalised,
 * letters, not a generic legal suffix) from the vault keys — but ONLY from a key that
 * ENDS in a generic legal suffix (so it's unmistakably a fake company: "Tyrell Corp",
 * "Wonka Inc"), never from a fake address or name whose words are real places/surnames
 * that could then wrongly suppress a real value. Company fake pools are deliberately
 * fictional (Tyrell/Globex/Oscorp…), so a real company is ~never suppressed by a
 * coincidence. Returns capital + lowercase forms.
 */
export function buildFakeFragments(fakeKeys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of fakeKeys) {
    const words = key.split(/\s+/).filter(Boolean);
    if (words.length < 2) continue; // a single-word fake is already caught by `taken`
    if (!GENERIC_ORG_WORD.has(words[words.length - 1].toLowerCase())) continue; // not a company
    for (const w of words) {
      if (GENERIC_ORG_WORD.has(w.toLowerCase())) continue;
      if (w.length >= 3 && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w)) {
        out.add(w);
        out.add(w.toLowerCase());
      }
    }
  }
  return out;
}

/**
 * Whether `value` is (or is built entirely from) distinctive fragments of a fake
 * company — so it must not be re-faked. A lone fragment ("Tyrell"), or the same
 * fragment re-suffixed by the model/result ("Tyrell Corporation"), both qualify.
 */
export function isFakeFragment(value: string, fragments: Set<string>): boolean {
  if (fragments.size === 0) return false;
  if (fragments.has(value)) return true;
  const words = value.split(/\s+/).filter(Boolean);
  return (
    words.length > 1 &&
    words.some((w) => fragments.has(w)) &&
    words.every((w) => fragments.has(w) || GENERIC_ORG_WORD.has(w.toLowerCase()))
  );
}
