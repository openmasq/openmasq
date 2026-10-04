import { CONTACT_LABEL_WORDS } from "../labels/terms";

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
// …and a street NAME (permissive, up to 38 chars of letters and spaces, `shapes.ts`) runs on
// into the sentence that follows when nothing punctuates it: « 12 rue des Lilas depuis 2019
// avec sa femme » vaulted the whole clause and the model never read it. Two signals end it —
// a word that opens a continuation and is never part of a street name (lowercase only, so a
// « rue du Matin » is untouched; « et »/« and » left out, they live in real names), and a
// contact label starting the next field (« … Moulin Messagerie : »).
const PROSE_WORDS = [
  "depuis", "avec", "demain", "hier", "aujourd'hui", "matin", "soir", "pour", "sont", "est",
  "était", "sera", "où", "qui", "que", "quand", "mais", "donc", "car", "puis", "ensuite",
  "après", "avant", "pendant", "dès", "convoqu[ée]e?s?", "situ[ée]e?s?",
  "since", "with", "tomorrow", "yesterday", "today", "for", "is", "are", "was", "where",
  "which", "who", "when", "but", "then", "after", "before", "during",
].join("|");
const PROSE_START = new RegExp(`[\\s,]+(?:${PROSE_WORDS})(?![\\p{L}'’])`, "u");
const LABEL_START = new RegExp(
  `[\\s,]+(?:${CONTACT_LABEL_WORDS.map((w) => w[0].toUpperCase() + w.slice(1)).join("|")})(?![\\p{L}])`,
  "u",
);
/** Cuts a street name where the sentence or the next field begins (see above). */
export function trimProseTail(v: string): string {
  const cut = [PROSE_START.exec(v), LABEL_START.exec(v)].filter((m) => m && m.index > 0);
  return cut.length ? v.slice(0, Math.min(...cut.map((m) => m!.index))) : v;
}

/** Cuts at the END of the address. Exported because the labeled field « Adresse : … » has the
 *  same need (its capture goes to the end of the LINE) and a 2nd implementation would drift. */
// A match at position 0 is the HOUSE NUMBER, never a postal code: « 3301 McKinney Ave » read
// as « 3301 » + city « Mc… » and was cut to « 3301 Mc », the street itself left in clear.
const ADDR_END_ALL = new RegExp(ADDR_END.source, "gu");
export function trimAddressTail(v: string): string {
  for (const m of v.matchAll(ADDR_END_ALL)) {
    if (m.index > 0) return v.slice(0, m.index + m[0].length);
  }
  return v;
}
