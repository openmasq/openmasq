import { isCodeReference } from "../validators";
// The VALUE of a labeled field: clean it, bound it, and decide whether it is one. Every
// labeled-field pass goes through these three functions — the single copy of the gate
// (rule 9): here we decide what a value IS, in the patterns file where it starts.
import { isStopword, isGenericTerm, isGenericCompound, stripOrgAffixes } from "../../model/detect";
import { trimAddressTail } from "../addresses";

// A NAME field whose value is a CODE IDENTIFIER (`name: read-data-schema`, `getUserById`)
// is tool/API metadata, not a person — read as a multi-word NAME it hands each fragment
// an alias that redacts every occurrence conversation-wide. Three shapes: an underscore;
// camelCase starting lowercase ("McDonald" stays detected); 3+ lowercase kebab/dotted
// segments (a 2-segment "jean-rebour" still counts as a name — pinned in tests).
const CODE_IDENT = /_|^[a-z][a-z0-9]*[A-Z]|^[a-z0-9]+(?:[-.][a-z0-9]+){2,}$/;

// Field kinds whose value is inherently numeric — a captured value with no digit
// at all is a false positive (see the gate in detectLabeledFields).
const NUMERIC_CATS = new Set(["PHONE", "IBAN", "CARD", "POSTAL_CODE", "DOB"]);
// ⚠️ A BRACKETED value is a placeholder only when what it holds is a TEMPLATE token —
// letters, spaces, `_`, `.`, `-`. `Email: <john@exemple.fr>` is the RFC form of a REAL
// address, `Client: (SIRET 123…)` a real datum: an `@` or a digit means it is not a template,
// and the value is kept (fail closed — a wrong drop ships it in clear).
const PLACEHOLDER =
  /^(?:n\/?a|néant|neant|none|null|undefined|non renseigné|non renseigne|-+|—+|_{2,}|\.{2,}|x{2,}|tbd|tba|tbc|unknown|pending|not (?:provided|applicable|available|specified|given|known|listed)|to be (?:filled|determined|confirmed|provided|advised|completed)\b.*|see (?:attached|above|below|attachment)|non applicable|inconnu|à compléter|a completer|à renseigner|a renseigner|à définir|a definir|en attente|voir (?:ci-joint|ci-dessus|ci-dessous|pièce jointe)|[[<{(][\p{L} _.\-]{0,40}[\]>})])$/iu;
/**
 * A SENTENCE under a NAME label (« Skin contact: Wash off with soap and water ») is not a
 * person. The discriminant is the CASING of the substantive words, never the word count:
 * « Marie-Claire de la Tour du Pin » is six words. A name never has several LOWERCASE
 * non-particle words; « van der Berg de Vries » has one, so the floor is two.
 */
function isProse(v: string): boolean {
  const words = v.split(/\s+/u).filter(Boolean);
  if (words.length < 5) return false;
  return words.filter((w) => /^\p{Ll}/u.test(w) && !isStopword(w)).length >= 2;
}
/** The categories whose value may carry a « . » followed by a space (see the sentence cut). */
const SENTENCE_KEEPS = new Set(["NAME", "ADDRESS", "ORG", "CITY", "PLACE"]);

/** Cut a captured value at the start of the NEXT field on the same line, at a
 *  column gap (tab / fullwidth space / 2+ spaces), or at 80 chars — then trim.
 *  Handles both Latin (`Word :`) and CJK (`ラベル：`, fullwidth colon) next-fields. */
export function cleanValue(raw: string): string {
  // Field separators: a tab, a fullwidth space (CJK), a 2+ space gap, the ` | ` of the
  // tabular header annotation (`documents/tabular.ts`), a space-surrounded EM-DASH /
  // middle dot / bullet (one-line forms). The SIMPLE hyphen is excluded: it lives inside
  // names and addresses (« Saint-Ouen », « 12-14 rue »).
  let v = raw.split(/\t|　|\s{2,}|\s\|\s|\s[—–·•]\s/u)[0] ?? raw;
  // Guillemets bound a quoted value and never sit inside a name/id/secret: cut there.
  v = v.split(/[«»]/)[0] ?? v;
  // Next field: a short token (Latin word OR CJK run) before a colon, INCLUDING the
  // "N° xxx :" label form — else the rest of the line becomes the NAME value.
  const nextField = v.search(
    /\s+\p{Lu}[\p{L}]{2,}\s*[:：]|\s+[Nn][°º][^:：\n]{0,20}[:：]|[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]{1,6}[:：]/u,
  );
  if (nextField > 0) v = v.slice(0, nextField);
  v = v.replace(/^[\s:：=.–—-]+/u, "").trim();
  // A serialised value keeps its QUOTES (YAML, JSON): vaulting them makes the fake replace
  // the document's punctuation. Strip a MATCHED surrounding pair only.
  v = v.replace(/^(["'`])([\s\S]*)\1$/u, "$2").trim();
  // The 80-char cap must not CUT a code reference: an expression of references cut at 80
  // lands mid-call, and the reference gate downstream then reads the fragment as a secret.
  // So the reference is measured BEFORE the cut.
  if (v.length <= 80 || isCodeReference(v)) return v;
  return v.slice(0, 80).trim();
}

/** A NAME field's value, trimmed to the NAME: the civil-status tail after a comma is other
 *  fields' territory (date and birthplace have their OWN detectors), and the leading
 *  honorific is a role word whose alias would redact every future « Madame ». */
const LEAD_HONORIFIC =
  /^(?:m\.|mme\.?|mlle\.?|mr\.?|mrs\.?|ms\.?|dr\.?|monsieur|madame|mademoiselle|docteur|ma[îi]tre|me)[^\S\r\n]+/iu;

/**
 * Beyond the comma, three boundaries end a NAME value, each impossible in a person's name:
 * an opening PARENTHESIS, a SPACE-SURROUNDED DASH (the simple hyphen lives in names), and a
 * token carrying an `@` or 2+ digits. Without them the whole line is ONE NAME value whose
 * fake rewrites only name words, so the phone/date/email nested in it travels IN CLEAR
 * inside the fake. What gets cut falls back under its OWN detectors. Pinned in
 * `contextFields.test.ts` + `../__cases__/labelledNeighbour.test.ts`.
 */
const NAME_FIELD_END = /[(（[]|\s[-–—]\s|\S*@|\d{2}/u;

function trimNameValue(v: string): string {
  const head = v.split(",")[0];
  const cut = head.search(NAME_FIELD_END);
  const kept = cut > 0 ? head.slice(0, cut) : head;
  // The cut leaves a dangling separator (« REBOUR (» → « REBOUR »).
  return kept
    .replace(LEAD_HONORIFIC, "")
    .replace(/[\s(（[\-–—]+$/u, "")
    .trim();
}

/** The shared per-value gate every labeled-field pass applies, and the ONLY copy of it.
 *  Returns the accepted value + its (possibly promoted) category, or `null` to drop the
 *  candidate. Exported so a pass living in another file — the detached label BLOCK
 *  (`labelBlocks.ts`) — cannot drift from the inline/vertical ones. */
export function acceptFieldValue(
  raw: string,
  groupCategory: string,
  numeric: boolean = NUMERIC_CATS.has(groupCategory),
): { value: string; category: string } | null {
  let value = raw;
  if (groupCategory === "ORG") value = stripOrgAffixes(value);
  if (groupCategory === "NAME") value = trimNameValue(value);
  // An ADDRESS value stops at the end of the address (a labeled capture runs to the end of
  // the line). Same cut as the address detector, not a second one (rule 9).
  if (groupCategory === "ADDRESS") value = trimAddressTail(value);
  // An IDENTIFIER stops at the COMMA: what follows is another field with its own detector,
  // and a number-faker would otherwise rewrite the IP glued after it.
  if (groupCategory === "ID") value = value.split(/[,;]/)[0].trim();
  // EVERY value but a name, an address, an organisation or a city stops at the end of the
  // SENTENCE, else the fake rewrites the clause after the identifier. « St. Louis » is a city.
  if (!SENTENCE_KEEPS.has(groupCategory)) value = value.split(/\.(?:\s|$)/u)[0].trim();
  if (value.length < 2) return null;
  if (!/[\p{L}\p{N}]/u.test(value)) return null; // must carry a letter or digit
  // A numeric-kind field whose "value" carries NO digit is prose, not the field's value.
  if (numeric && !/\d/.test(value)) return null;
  // …and a digit is not enough: two or more FUNCTION words means we captured a sentence.
  if (numeric && value.split(/[\s,;]+/u).filter((w) => w && isStopword(w)).length >= 2) {
    return null;
  }
  // A PLACEHOLDER is not a value (« N/A », « TBD », « [Insert Coverage Limit] », underscores).
  if (PLACEHOLDER.test(value)) return null;
  // A value that REFERENCES a secret (`var.x`) is not one: masking it corrupts the code and
  // protects nothing. One home for that test (`engine/validators/validators.config.ts`).
  if (isCodeReference(value)) return null;
  // …and neither is a SENTENCE under a NAME label (see `isProse`).
  if (groupCategory === "NAME" && isProse(value)) return null;
  // …nor a running PROSE clause under a SECRET label: a key has no spaces, a passphrase is
  // short. The escape is a SECRET SYMBOL (`_ / ! @ # …`), which real keys carry and a
  // plain-word clause does not; the prose-password pass (`codes.ts`) still catches a
  // symbol-bearing passphrase behind a copula.
  if (groupCategory === "SECRET" && isProse(value) && !/[^\s\p{L}\p{N},.'’-]/u.test(value))
    return null;
  if (isStopword(value) || isGenericTerm(value) || isGenericCompound(value)) return null;
  if (groupCategory === "NAME" && CODE_IDENT.test(value)) return null;
  // A CITY or POSTAL_CODE field holding "CP + Ville" ("92110 CLICHY") is a PLACE: fake the
  // CODE and the CITY TOGETHER (`fakeGeo` PLACE) instead of splitting them.
  const category =
    (groupCategory === "CITY" || groupCategory === "POSTAL_CODE") &&
    /^\d{4,5}\s+\p{Lu}/u.test(value)
      ? "PLACE"
      : groupCategory;
  return { value, category };
}
