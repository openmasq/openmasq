import { isNotoriousEntity, type NotorietyOpts } from "../notorious";

/**
 * Two gates that need the SURROUNDING TEXT, not just the candidate's value.
 *
 * Every other gate in `filter.ts` decides on the value alone — that is what makes them
 * cheap and order-independent. These two cannot: the same word is an identity or noise
 * depending on what sits next to it, and deciding without looking produced two of the
 * worst defects seen on a real document (a Pôle emploi registration letter):
 *
 *   « recherche d'torvel », « demandeurs d'torvel », « Offre Raisonnable d'Torvel »
 *   « Allège les phrases avignon sans changer le sens »   ← the USER'S OWN prompt
 *
 * Both are FP-prevention gates: they can only ever let a value through in clear, never
 * redact more. So each is written to fire on a NARROW, positively-identified pattern —
 * an adjacency to a known entity, a prose position — and to keep the candidate whenever
 * the evidence is absent.
 */

const WORD = "[\\p{L}\\p{M}\\p{N}''’-]+";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every occurrence of `value` in `input`, with the adjacent word on each side. */
function occurrences(value: string, input: string): { before: string; after: string }[] {
  const re = new RegExp(
    `(${WORD})?[ \\t]*${escapeRe(value)}[ \\t]*(${WORD})?`,
    "giu",
  );
  const out: { before: string; after: string }[] = [];
  for (const m of input.matchAll(re)) out.push({ before: m[1] ?? "", after: m[2] ?? "" });
  return out;
}

/**
 * True when the candidate is a WORD OF a notorious entity that is present in this very
 * text — « emploi » next to « Pôle », « Travail » next to « France ».
 *
 * `isNotoriousEntity` matches the WHOLE value, so a detector that emits a fragment walks
 * straight past it. On the letter above, the NER proposed « emploi » alone: the whole
 * document was then rewritten around an invented company, in three case variants, while
 * « Pôle emploi » itself was correctly recognised as notorious two characters away.
 *
 * Category-SCOPED like the notoriety check it extends, so a person surnamed Renault is
 * still protected next to a car (`isNotoriousEntity("… Renault", "name")` is false), and
 * anchored on the TEXT: a bare « emploi » in a message that never says « Pôle emploi »
 * is not a fragment of anything and stays a candidate.
 */
export function isNotoriousFragment(
  value: string,
  cat: string,
  input: string,
  notoriety?: NotorietyOpts,
): boolean {
  // A multi-word value is already tested whole by the caller; only a fragment can gain
  // notoriety from its neighbour, and a 1-2 char one is too weak a hook to trust.
  if (value.trim().length < 3) return false;
  // ⚠️ `shape: false` — the SHAPE dispensation (model-name grammar) is excluded
  // from the recomposition. See `NotorietyOpts.shape`: « madame Claude 3 fois » was
  // recomposing into « Claude 3 » and freeing the first name. This gate only holds against
  // entities NAMED in a closed list, never against a productive grammar.
  const opts = { ...notoriety, shape: false };
  for (const { before, after } of occurrences(value, input)) {
    if (before && isNotoriousEntity(`${before} ${value}`, cat, opts)) return true;
    if (after && isNotoriousEntity(`${value} ${after}`, cat, opts)) return true;
    if (before && after && isNotoriousEntity(`${before} ${value} ${after}`, cat, opts)) return true;
  }
  return false;
}

/**
 * Words that introduce a PLACE. Their presence is what tells « originaire de lourdes »
 * (a real mention, keep) from « les phrases lourdes » (an adjective, drop) — the single
 * discriminator that makes this gate safe enough to ship.
 */
const LOCATIVE = new Set([
  // fr
  "à", "a", "au", "aux", "de", "du", "des", "en", "vers", "chez", "sur", "sous", "dans",
  "près", "pres", "proche", "depuis", "jusqu", "entre", "par", "via", "habite", "domicilié",
  "domicilie", "demeurant", "né", "ne", "née", "nee", "originaire", "ville", "commune",
  "cedex", "quartier", "région", "region", "département", "departement",
  // en / es / de / it / pt
  "in", "at", "near", "from", "to", "of", "city", "town", "born", "living",
  "nach", "bei", "aus", "wohnhaft", "geboren", "stadt",
  "hacia", "desde", "para", "ciudad", "nacido", "reside",
  "presso", "verso", "città", "citta", "nato",
  "cidade", "nascido", "morada",
]);

/**
 * True when a LOCATION candidate is an all-lowercase common word sitting in ordinary
 * prose — « lourdes » the adjective, « vannes » the valves — rather than a place.
 *
 * A place name is capitalised in real text; these homographs are not, and faking them
 * corrupts the sentence they belong to. The one that hurt most was in the user's own
 * instruction: « Allège les phrases lourdes » reached the model as « les phrases
 * avignon », so the model was asked to do something meaningless.
 *
 * ⚠️ Bounded deliberately, because a lowercase place IS sometimes a real mention:
 * - a single occurrence introduced by a locative word (« à rennes », « habite vannes »,
 *   « wohnhaft leipzig ») keeps the candidate — casual lowercase typing is exactly how a
 *   user writes their own city, and that must stay protected;
 * - so does an occurrence next to a POSTAL CODE (« 35000 rennes ») or any capitalised
 *   occurrence elsewhere in the text.
 * The candidate is dropped only when EVERY occurrence is unanchored prose.
 */
export function isProseGeoHomograph(value: string, input: string): boolean {
  const v = value.trim();
  if (v.length < 4 || v !== v.toLowerCase() || !/\p{L}/u.test(v)) return false;
  // Capitalised anywhere in the text → it is being used as a proper noun here.
  if (new RegExp(`\\b${escapeRe(v.charAt(0).toUpperCase() + v.slice(1))}\\b`, "u").test(input))
    return false;
  const occ = occurrences(v, input);
  if (!occ.length) return false;
  return occ.every(({ before, after }) => {
    // NO neighbour at all (start of the text, a bare line « rennes ») is not evidence of
    // prose — it is no evidence at all, and this gate must fail CLOSED on no evidence.
    if (!before) return false;
    const b = before.toLowerCase().replace(/[''’]$/, "");
    // Address shape on EITHER side: « 35000 rennes » and « rennes 35000 » both occur on
    // a real form, and only checking the left side let the second one through in clear.
    if (/^\d{4,6}$/.test(b) || /^\d{4,6}$/.test(after)) return false;
    return !LOCATIVE.has(b);
  });
}

/**
 * True when a PLACE candidate only lives as a SNAKE_CASED machine-identifier
 * segment. A real bank export carries `Type: CARD_PAYMENT`; the detector
 * read it as a place and the column went out as `METZ_PAYMENT` — an invented city inside a
 * technical enumeration, which the model takes for a transaction type that doesn't exist.
 * An identifier segment is not a place mention: the fake corrupts STRUCTURED
 * data and shelters no one.
 *
 * Deliberately bounded (FP-prevention: can only let something through in clear):
 * - the caller only serves it for the PLACE category — a NAME in a transfer
 *   reference (`SALAIRE_REBOUR_08`) stays redacted;
 * - the value must be a single UPPERCASE/digit token;
 * - EVERY occurrence must be `_`-fused to another UPPERCASE segment; a
 *   free occurrence elsewhere, an ambiguous neighbour (glued without `_`, mixed case) or
 *   zero occurrences ⇒ no evidence ⇒ keep the candidate (fail closed).
 */
export function isMachineTokenGeo(value: string, input: string): boolean {
  const v = value.trim();
  if (v.length < 2 || !/^[A-Z][A-Z0-9]*$/.test(v)) return false;
  let embedded = false;
  for (let i = input.indexOf(v); i >= 0; i = input.indexOf(v, i + 1)) {
    const prev = input[i - 1] ?? "";
    const next = input[i + v.length] ?? "";
    // Glued to other uppercase letters WITHOUT a « _ »: this isn't an occurrence of the token
    // (`CARDIO…`) — ambiguous, so we keep the candidate.
    if (/[A-Z0-9]/.test(prev) || /[A-Z0-9]/.test(next)) return false;
    const snakeLeft = prev === "_" && /[A-Z0-9]/.test(input[i - 2] ?? "");
    const snakeRight = next === "_" && /[A-Z0-9]/.test(input[i + v.length + 1] ?? "");
    if (!snakeLeft && !snakeRight) return false; // free occurrence → a real mention is possible
    embedded = true;
  }
  return embedded;
}

/**
 * Expressions that TIE an entity to the person writing. Their presence right
 * before the value removes the notoriety dispensation.
 *
 * Why: « Google » is public knowledge, but in « je travaille chez Google »
 * the data isn't Google — it's **the user's employer**. Notoriety
 * answers "everyone knows this company"; it doesn't answer "everyone
 * knows YOU work there". A manual bench flagged exactly these sentences, and it
 * was right on the substance even though it counted eleven deliberate dispensations as failures.
 *
 * Covers ONLY first-person attachment (or the company's "nous"):
 * « Total a répondu à l'appel d'offres » stays in clear, because Total is a third party there.
 */
const SELF_BOUND =
  /(?:je travaille (?:chez|pour|à)|je bosse (?:chez|pour)|je suis (?:salarié|salariée|employé|employée|stagiaire|associé|associée)\s+(?:chez|de|d[eu]|à)|mon (?:entreprise|employeur|client|fournisseur|cabinet|agence|école|université|banque|assurance|patron)|ma (?:société|boîte|boite|banque|mutuelle|école|ecole|agence|clinique)|notre (?:client|fournisseur|entreprise|société|societe|partenaire|prestataire|banque)|nos clients|mes clients|i work (?:at|for)|my (?:employer|company|firm|client|bank|school|university)|our (?:client|company|supplier|partner|bank))\b[^.!?;\n]{0,40}$/iu;

/**
 * True when the value is presented as BELONGING to the writer — employer,
 * client, bank, school. Notoriety then gives way: the entity's fame doesn't make
 * the user's relationship with it public.
 *
 * ONE tied occurrence is enough: naming your employer once then mentioning it
 * again elsewhere in the message doesn't make it public retroactively.
 */
export function isSelfBoundEntity(value: string, input: string): boolean {
  const v = value.trim();
  if (v.length < 2) return false;
  const re = new RegExp(escapeRe(v), "giu");
  for (const m of input.matchAll(re)) {
    if (SELF_BOUND.test(input.slice(Math.max(0, m.index - 80), m.index))) return true;
  }
  return false;
}
