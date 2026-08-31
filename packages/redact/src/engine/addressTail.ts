// Where an address ENDS — the sole subject of this file, split out of `addresses.ts` to
// keep it under the cap AND because the labeled field « Adresse : … » needs the
// SAME cut (rule 9: a second implementation would drift).

// A French/EU street address ENDS at its "postal code + city". The NAME/CITY
// sub-patterns are permissive (they allow spaces + `.` so multi-word streets and
// cities match), so a span sometimes over-runs into trailing legal boilerplate glued
// to the city — "… 75012 PARIS. SIRET 863 471 587", "…75012 PARISsiège",
// "…75012 Paris.Capital: 100€.". Because the captured VALUE is the vault key, the
// SAME address written with different trailing text became DIFFERENT spans → a
// DIFFERENT fake each time (the reported bug). `trimAddressTail` cuts the value right
// after the city so every trailing variant collapses to ONE span (→ one fake).
//
// City = a run of Capitalised words (all-caps "PARIS" OR Title "Paris"), joined by
// space/hyphen, French connectors (en/de/la/sur…) lowercased — so it STOPS at a
// period, a digit, or a lowercase-glued continuation ("PARIS"→ drops "siège"). Only
// the FR/EU "code → city" order is handled (EN "City ST ZIP" / CJK are left as-is).
const CITY_WORD = "\\p{Lu}\\p{Ll}+|\\p{Lu}+";
// The connectors that live INSIDE a place name (« Neuilly sur Seine », « Villeneuve-d'Ascq »).
const CITY_CONN = "en|de|du|des|la|le|les|l[eè]s|sur|sous|aux?|d['’]";
// ⚠️ « et » only appears in a commune name HYPHENATED (« Ille-et-Vilaine »); spaced,
// it's the most common conjunction in French.
const CITY_CONN_HYPHEN = "et";
// ⚠️ A connector must be FRAMED by two city words: a run cannot end on one.
// Reported by a user (12/08/2026) — « … 67000 Strasbourg et je travaille »
// vaulted « Strasbourg et », so the fake ERASED the « et » and the model received a
// mutilated text. Same for « Strasbourg sur le papier » → « Strasbourg sur le ». `detectors.test.ts`.
const CITY_RUN = `(?:${CITY_WORD})(?:(?:[ -](?:${CITY_WORD}|${CITY_CONN})|-(?:${CITY_CONN_HYPHEN})){0,3}[ -](?:${CITY_WORD}))?`;
const ADDR_END = new RegExp(
  `(?:\\d{5}|\\d{4}-\\d{3}|\\d{4}\\s?[A-Z]{2}|\\d{4})[,\\s]+(?:${CITY_RUN})`,
  "u",
);
/** Cuts at the END of the address. Exported because the labeled field « Adresse : … » has the
 *  same need (its capture goes to the end of the LINE) and a 2nd implementation would drift. */
export function trimAddressTail(v: string): string {
  const m = ADDR_END.exec(v);
  return m ? v.slice(0, m.index + m[0].length) : v;
}
