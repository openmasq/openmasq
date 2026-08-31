// The VALUE of a labeled field: clean it, bound it, and decide whether it is one.
//
// Every pass in `contextFields.ts` (inline, vertical, serialised) and the detached
// BLOCKS pass (`labelBlocks.ts`) go through these three functions — it's the single copy
// of the gate (rule 9). Keeping them together, outside the PATTERNS file, keeps the surface
// legible: here we decide what a value IS, there where it starts.
import { isStopword, isGenericTerm, isGenericCompound, stripOrgAffixes } from "../model/detect";
import { trimAddressTail } from "./addresses";

// A NAME field whose value is a CODE IDENTIFIER is tool/API metadata, not a person.
// MCP tool descriptions are YAML — `name: read-data-schema`, `name: create_issue`,
// `name: getUserById` — and a value read as a multi-word NAME hands each fragment its
// own alias ("data"→fake) which then redacted every occurrence conversation-wide (the
// reported PostHog overredaction). Three shapes, none a human name in a name field:
// an underscore anywhere; a single token that STARTS lowercase then carries an
// uppercase (camelCase — "McDonald"/"DiCaprio" start uppercase and stay detected);
// 3+ lowercase kebab/dotted segments (a lowercase 2-segment "jean-rebour" in a real
// form still counts as a name — the conservative boundary, pinned in tests).
const CODE_IDENT = /_|^[a-z][a-z0-9]*[A-Z]|^[a-z0-9]+(?:[-.][a-z0-9]+){2,}$/;

// Field kinds whose value is inherently numeric — a captured value with no digit
// at all is a false positive (see the gate in detectLabeledFields).
const NUMERIC_CATS = new Set(["PHONE", "IBAN", "CARD", "POSTAL_CODE", "DOB"]);

/** Cut a captured value at the start of the NEXT field on the same line, at a
 *  column gap (tab / fullwidth space / 2+ spaces), or at 80 chars — then trim.
 *  Handles both Latin (`Word :`) and CJK (`ラベル：`, fullwidth colon) next-fields. */
export function cleanValue(raw: string): string {
  // A tab, a fullwidth space (common CJK field separator), a 2+ space gap, or the
  // ` | ` column separator used by the tabular (CSV/XLSX) header-annotation
  // (`documents/tabular.ts`) — so a `nom: Rebour | ville: Lyon` row yields just
  // "Rebour" for the `nom` field, not the whole rest of the line.
  // …and the EM-DASH surrounded by spaces, the field separator of every one-line
  // form (« Numéro étudiant : 22104877 — Né le 2 février 2003 »). Without it, the
  // greedy capture would carry off the next field, and the fake would rewrite the birth
  // date at the same time as the identifier. The SIMPLE hyphen is excluded: it lives
  // inside names and addresses (« Saint-Ouen », « 12-14 rue »).
  let v = raw.split(/\t|　|\s{2,}|\s\|\s|\s[—–]\s/u)[0] ?? raw;
  // Next field: a short token (Latin word OR CJK run) immediately before a colon —
  // INCLUDING the "N° xxx :" label form ("Nom et prénom : REBOUR Jean N° sécu :
  // 184…" — without it the whole rest of the line became the NAME value, the NIR
  // rode inside a composite that never re-applied, and "sécu" got a NAME alias
  // that then redacted every «sécu» in the conversation).
  const nextField = v.search(/\s+\p{Lu}[\p{L}]{2,}\s*[:：]|\s+[Nn][°º][^:：\n]{0,20}[:：]|[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]{1,6}[:：]/u);
  if (nextField > 0) v = v.slice(0, nextField);
  v = v.replace(/^[\s:：=.–—-]+/u, "").trim();
  // A serialised value keeps its QUOTES ("name: \"Inès FONSEQUA\"" in YAML, a JSON
  // record) — vaulting them makes the fake replace the document's own punctuation, so
  // the substituted line is no longer valid YAML/JSON. Strip a MATCHED surrounding pair
  // only; an apostrophe inside the value (« l'Étang ») is untouched.
  v = v.replace(/^(["'`])([\s\S]*)\1$/u, "$2").trim();
  return v.length > 80 ? v.slice(0, 80).trim() : v;
}

/** A NAME field's value, trimmed to the NAME: the civil-status tail after a comma is
 *  other fields' territory ("Gérant : Madame Inès FONSEQUA, née le 17 mai 1988 à
 *  Villeurbanne" — the date and birthplace have their OWN detectors), and the leading
 *  honorific is a role word. Untrimmed, the whole line became ONE composite NAME whose
 *  per-word aliases included « Madame » — and every future « Madame » in the
 *  conversation was redacted. */
const LEAD_HONORIFIC = /^(?:m\.|mme\.?|mlle\.?|mr\.?|mrs\.?|ms\.?|dr\.?|monsieur|madame|mademoiselle|docteur|ma[îi]tre|me)[^\S\r\n]+/iu;

/**
 * ⚠️ LEAK — the comma wasn't the only boundary, and the others let the
 * neighbouring field's value go out IN CLEAR (measured on 16/08/2026):
 *
 * | Input | What went out |
 * |---|---|
 * | `Contact : Julien Sabourdin (06 12 34 56 78)` | the phone number, in clear |
 * | `Gérant : Julien Sabourdin (né le 12/03/1984)` | the birth date, in clear |
 * | `Contact : Julien Sabourdin - julien@exemple.fr` | the email, in clear |
 *
 * The mechanics, visible in the vault: the key was `"Aurèle Aubertin (06 12 34 56 78)"`
 * — the REAL phone number inside the FAKE. The labeled field was capturing the whole line
 * as ONE NAME value; the nested phone candidate was then dropped by the de-nest
 * (`model/pseudonymize/filter.ts`, rightly: all its occurrences sit inside a longer
 * candidate); and a NAME's fake generator rewrites ONLY name words — digits
 * and addresses pass right through.
 *
 * Three boundaries are therefore added to the comma, each impossible in a person's
 * name: an opening PARENTHESIS, a SPACE-SURROUNDED DASH (« Jean-Pierre » and
 * « Saint-Ouen » don't carry one — it's the SIMPLE hyphen that lives in names, never
 * the spaced one), and a token carrying an `@` or a run of 2+ digits.
 *
 * This isn't a coverage loss: what gets cut falls back under its OWN
 * detectors (phone, DOB, email, identifier), which couldn't see it while it was
 * nested. Same reasoning, and same benefits, as the comma cut.
 * Pinned in `contextFields.test.ts` + `../labelledNeighbour.test.ts` (the WIRE).
 */
const NAME_FIELD_END = /[(（[]|\s[-–—]\s|\S*@|\d{2}/u;

function trimNameValue(v: string): string {
  const head = v.split(",")[0];
  const cut = head.search(NAME_FIELD_END);
  const kept = cut > 0 ? head.slice(0, cut) : head;
  // The cut leaves a dangling separator (« REBOUR (» → « REBOUR »).
  return kept.replace(LEAD_HONORIFIC, "").replace(/[\s(（[\-–—]+$/u, "").trim();
}

/** The shared per-value gate every labeled-field pass applies, and the ONLY copy of it.
 *  Returns the accepted value + its (possibly promoted) category, or `null` to drop the
 *  candidate. Exported so a pass living in another file — the detached label BLOCK
 *  (`labelBlocks.ts`) — cannot drift from the inline/vertical ones. */
export function acceptFieldValue(
  raw: string,
  groupCategory: string,
): { value: string; category: string } | null {
  let value = raw;
  if (groupCategory === "ORG") value = stripOrgAffixes(value);
  if (groupCategory === "NAME") value = trimNameValue(value);
  // An ADDRESS value stops at the end of the address. A labeled field's capture goes
  // to the end of the line: without this, « Adresse : 3 quai des Bateliers, 67000 Strasbourg
  // et mon bureau est ailleurs » went out WHOLE into the vault, and the model received an
  // address fake in place of the rest of the sentence. Same cut as the address
  // detector, not a second one (rule 9).
  if (groupCategory === "ADDRESS") value = trimAddressTail(value);
  // …and an IDENTIFIER stops at the COMMA, for the same reason the NAME stops at
  // its own: a labeled field's capture goes to the end of the line. Measured on
  // 16/08/2026 when adding log-style labels — « user_id=8842019, ip 192.0.2.44 »
  // was becoming ONE identifier value, and the number-faker was rewriting the IP
  // inside it… as « 944.9.8.74 », an address that doesn't exist. An identifier never
  // carries a comma; what follows it is another field, and it has its own detector.
  if (groupCategory === "ID") value = value.split(/[,;]/)[0].trim();
  if (value.length < 2) return null;
  if (!/[\p{L}\p{N}]/u.test(value)) return null; // must carry a letter or digit
  // A numeric-kind field (phone/IBAN/card/CP/date) whose "value" carries NO digit is
  // prose, not the field's value — never redact a sentence as a PHONE (its
  // digit-faker would be an identity pass-through).
  if (NUMERIC_CATS.has(groupCategory) && !/\d/.test(value)) return null;
  // …and a digit is not enough: a SENTENCE that happens to carry a date ("Fait à Lyon,
  // le 06/02/2026 —") satisfied the digit test and was vaulted as an IBAN, so the fake
  // rewrote a whole clause of the document. An identifier/phone/postal value is not
  // prose: two or more FUNCTION words in it means we captured a sentence.
  if (
    NUMERIC_CATS.has(groupCategory) &&
    value.split(/[\s,;]+/u).filter((w) => w && isStopword(w)).length >= 2
  ) {
    return null;
  }
  if (/^(n\/?a|néant|neant|none|null|undefined|non renseigné|-+|—+)$/iu.test(value)) return null;
  if (isStopword(value) || isGenericTerm(value) || isGenericCompound(value)) return null;
  if (groupCategory === "NAME" && CODE_IDENT.test(value)) return null;
  // A CITY/Commune/Ville field whose value is a "CP + Ville" ("92110 CLICHY") is a PLACE,
  // not a bare city: fake the CODE and the CITY TOGETHER (coherent, `fakeGeo` PLACE)
  // instead of a bare city that DROPS the postal.
  // …and a POSTAL_CODE field holding one is the same object seen from the other side
  // ("Code postal / Ville" → "59800 Lille"): a bare postal fake beside a real city, or
  // vice-versa, is the split this promotion exists to prevent.
  const category =
    (groupCategory === "CITY" || groupCategory === "POSTAL_CODE") &&
    /^\d{4,5}\s+\p{Lu}/u.test(value)
      ? "PLACE"
      : groupCategory;
  return { value, category };
}
