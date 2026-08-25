// La VALEUR d'un champ étiqueté : la nettoyer, la borner, et décider si c'en est une.
//
// Toutes les passes de `contextFields.ts` (en ligne, verticale, sérialisée) et la passe des
// BLOCS détachés (`labelBlocks.ts`) traversent ces trois fonctions — c'est l'unique copie
// de la garde (règle 9). Les tenir ensemble, hors du fichier des MOTIFS, garde la surface
// lisible : ici on décide ce qu'une valeur EST, là-bas où elle commence.
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
  // …et le TIRET CADRATIN entouré d'espaces, séparateur de champ de tous les formulaires
  // d'une ligne (« Numéro étudiant : 22104877 — Né le 2 février 2003 »). Sans lui, la
  // capture gloutonne emportait le champ suivant, et le faux réécrivait la date de
  // naissance en même temps que l'identifiant. Le trait d'union SIMPLE est exclu : il vit
  // à l'intérieur des noms et des adresses (« Saint-Ouen », « 12-14 rue »).
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
 * ⚠️ FUITE — la virgule n'était pas la seule frontière, et les autres laissaient partir la
 * valeur du champ voisin EN CLAIR (mesuré le 16/08/2026) :
 *
 * | Entrée | Ce qui partait |
 * |---|---|
 * | `Contact : Julien Sabourdin (06 12 34 56 78)` | le téléphone, en clair |
 * | `Gérant : Julien Sabourdin (né le 12/03/1984)` | la date de naissance, en clair |
 * | `Contact : Julien Sabourdin - julien@exemple.fr` | l'e-mail, en clair |
 *
 * La mécanique, visible dans le coffre : la clé était `"Aurèle Aubertin (06 12 34 56 78)"`
 * — le VRAI téléphone à l'intérieur du FAUX. Le champ étiqueté capturait la ligne entière
 * comme UNE valeur NOM ; le candidat téléphone imbriqué était alors écarté par le de-nest
 * (`model/pseudonymize/filter.ts`, à raison : toutes ses occurrences sont dans un candidat
 * plus long) ; et le générateur de faux d'un NOM ne réécrit QUE les mots de nom — chiffres
 * et adresses passent au travers.
 *
 * Trois frontières s'ajoutent donc à la virgule, chacune impossible dans un nom de
 * personne : une PARENTHÈSE ouvrante, un TIRET ENTOURÉ D'ESPACES (« Jean-Pierre » et
 * « Saint-Ouen » n'en portent pas — c'est le tiret SIMPLE qui vit dans les noms, jamais
 * l'espacé), et un jeton portant un `@` ou une course de 2+ chiffres.
 *
 * Ce n'est pas une perte de couverture : ce qui est coupé retombe sous ses PROPRES
 * détecteurs (téléphone, DOB, e-mail, identifiant), qui ne pouvaient pas le voir tant qu'il
 * était imbriqué. Même raisonnement, et mêmes bénéfices, que la coupe à la virgule.
 * Épinglé dans `contextFields.test.ts` + `../labelledNeighbour.test.ts` (le FIL).
 */
const NAME_FIELD_END = /[(（[]|\s[-–—]\s|\S*@|\d{2}/u;

function trimNameValue(v: string): string {
  const head = v.split(",")[0];
  const cut = head.search(NAME_FIELD_END);
  const kept = cut > 0 ? head.slice(0, cut) : head;
  // La coupe laisse un séparateur pendant (« REBOUR (» → « REBOUR »).
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
  // Une valeur d'ADRESSE s'arrête à la fin de l'adresse. La capture d'un champ étiqueté va
  // jusqu'au bout de la ligne : sans ça, « Adresse : 3 quai des Bateliers, 67000 Strasbourg
  // et mon bureau est ailleurs » partait EN ENTIER dans le coffre, et le modèle recevait un
  // faux d'adresse à la place de la fin de la phrase. Même coupe que le détecteur
  // d'adresses, pas une seconde (règle 9).
  if (groupCategory === "ADDRESS") value = trimAddressTail(value);
  // …et un IDENTIFIANT s'arrête à la VIRGULE, pour la même raison que le NOM s'arrête à la
  // sienne : la capture d'un champ étiqueté va jusqu'au bout de la ligne. Mesuré le
  // 16/08/2026 en ajoutant les libellés de journaux — « user_id=8842019, ip 192.0.2.44 »
  // devenait UNE valeur d'identifiant, et le faiseur de chiffres réécrivait l'IP à
  // l'intérieur… en « 944.9.8.74 », une adresse qui n'existe pas. Un identifiant ne porte
  // jamais de virgule ; ce qui la suit est un autre champ, et il a son propre détecteur.
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
