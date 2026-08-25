// Prose BIRTH DATES — the civil-status line every French deed/état-civil document
// carries: "Né à RENNES (35000) le 23 septembre 1996.", "née le 05/07/1990". The
// labeled-field detector needs a COLON so it never sees this prose form, and no date
// rule fires bare (a date is not PII by shape) — so the birth CITY was faked while
// the birth DATE shipped in clear, an identifying pair. OCR gluing is tolerated
// ("Néà RENNES", "le5 juillet 1990"). Only the DATE is emitted (category DOB → a
// valid same-format fake date); the birthplace is the geo detectors' span.
import type { Detection } from "../types";

const MONTH =
  "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const DATE = `(?:\\d{1,2}(?:er)?\\s*(?:${MONTH})\\s*\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;
// The intl month names (it/es/pt/de/en) + the numeric forms, for `BIRTH_INTL_RE`.
const MONTH_INTL =
  "gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre" +
  "|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre" +
  "|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro" +
  "|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember" +
  "|january|february|march|april|may|june|july|august|september|october|november|december";
// `\.?` after the day: the GERMAN ordinal dot (« geboren am 4. Juli 1968 ») — without
// it both German textual dates of the corpus shipped in clear beside a faked name.
const DATE_INTL = `(?:\\d{1,2}\\.?(?:\\s*de)?\\s*(?:${MONTH_INTL})(?:\\s*de)?\\s*\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;

// "né(e)(à)" then an optional bounded birthplace infix (same line, no sentence end)
// then "le" (possibly glued to the day) then the date. The infix is lazy and capped
// so an unrelated later date in the paragraph can never be pulled in.
// The same civil-status shape in the other contract languages the product covers —
// "nato a Napoli il 21/07/1980", "nacido en Sevilla el 3 de mayo de 1975", "geboren am
// 14.06.1975", "nascido em Lisboa a 2 de janeiro de 1988", "born on 5 May 1990". The
// FR-only anchor left every foreign contract's birth date in CLEAR beside a faked name
// and a faked birthplace — the identifying pair the FR branch exists to break.
// Formes qui NOMMENT la date de naissance sans le verbe « naître » — mesurées sur un
// bench manuel : « Son anniversaire est le 3 juillet 1992 » et « date de naissance :
// … » (sans deux-points) partaient en clair, alors que « né le … » était protégé.
// Une date d'anniversaire EST une date de naissance ; c'est la même donnée.
const BIRTH_WORD_INTL =
  "nat[oa]|nacid[oa]|nascid[oa]|geboren|born|anniversaire|date de naissance|birthday|birth date|date of birth|geburtsdatum|fecha de nacimiento|data di nascita|data de nascimento";
const BIRTH_INTL_RE = new RegExp(
  `\\b(?:${BIRTH_WORD_INTL})\\b(?:[^\\n.]{0,40}?)?[^\\S\\r\\n]*(?:est|is|ist)?[^\\S\\r\\n]*(?:il|el|am|a|on|le)?[^\\S\\r\\n]*(${DATE_INTL})`,
  "giu",
);

const BIRTH_RE = new RegExp(
  // « anniversaire » / « date de naissance » rejoignent « né(e) » : la branche INTL ne
  // couvre pas les mois FRANÇAIS, donc « Son anniversaire est le 3 juillet 1992 »
  // tombait entre les deux détecteurs.
  `\\b(?:n[ée](?:e|[àa]|e[àa])?|anniversaire|date de naissance)\\s*(?:[àa]\\s+)?(?:[^\\n.]{0,60}?\\s)?(le\\s*${DATE})`,
  "giu",
);

// The INVERSE order — "née le 17 mai 1988 à Villeurbanne" (date first, city after) —
// leaves the birth CITY with no detector: the labeled-fields need a colon, the notarial
// shape needs its parenthesised CP, and the date-first order keeps the city OUT of the
// birth infix above. The birth phrase is the precision gate (same discipline as every
// context gate): only a Capitalized run right after "<birth date> à " is a birthplace.
const BIRTH_CITY_RE = new RegExp(
  `\\bn[ée](?:e|[àa]|e[àa])?\\s*le\\s*${DATE}\\s*[àa]\\s+(\\p{Lu}[\\p{L}'’-]*(?:[ -]\\p{Lu}[\\p{L}'’-]*){0,3})`,
  "giu",
);

/** Detect prose civil-status birth dates ("Né à … le 23 septembre 1996"). */
export function detectBirthDates(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(BIRTH_CITY_RE)) {
    const city = (m[1] ?? "").trim();
    if (city && !seen.has(city)) {
      seen.add(city);
      out.push({ value: city, category: "CITY", start: m.index });
    }
  }
  for (const m of text.matchAll(BIRTH_INTL_RE)) {
    const value = (m[1] ?? "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push({ value, category: "DOB", start: m.index });
    }
  }
  for (const m of text.matchAll(BIRTH_RE)) {
    // A separated "le 23 septembre 1996" emits the DATE alone; the OCR-glued
    // "le5 juillet 1990" keeps its "le" IN the value — the bare date would be
    // word-glued in the text, which `applyVault` (rightly) refuses to substitute
    // inside, so the vaulted date would ship in clear. `fakeDate` preserves the
    // non-digit prefix, so the fake stays in-place readable ("le3 juillet 1957").
    const raw = (m[1] ?? "").trim();
    const value = /^le\s/.test(raw) ? raw.replace(/^le\s+/, "") : raw;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, category: "DOB", start: m.index });
  }
  out.push(...detectActDates(text));
  return out;
}

/**
 * La date d'un ACTE rattaché à des personnes nommées — « reçu le 12/03/2024 », « prise
 * d'effet le 01/07/2025 », « à compter du 01/09/2021 », « employé du … au … », « célébré
 * le 27/05/2017 ».
 *
 * Pourquoi elle manquait : le détecteur ci-dessus est gardé par le contexte de NAISSANCE,
 * et aucune règle ne tire sur une date nue — délibérément, sans quoi tout horodatage de
 * journal et toute date de facture seraient redacted. Résultat mesuré sur le banc : sur un
 * bail, un contrat de travail, un acte de mariage ou un compte rendu de consultation, les
 * parties étaient redacted et la date qui les rattache partait en clair. Or c'est la
 * paire qui ré-identifie : « embauché le 01/09/2021 » restreint un salarié à quelques
 * personnes.
 *
 * ⚠️ La garde est le VERBE, pas la date. Une liste d'AUTORISATION de participes d'acte,
 * suivie de son article, exactement comme la piste des identifiants (le libellé garde la
 * valeur). Ce qu'elle refuse volontairement : « facture du 12/03/2024 », « exporté le … »,
 * « 12/03/2024 10:04:22 » dans un journal — un acte, pas un horodatage.
 */
const ACT_VERB =
  "re[çc]u|sign[ée]e?s?|[ée]tabli[es]?|conclu[es]?|c[ée]l[ée]br[ée]e?|immatricul[ée]e?|" +
  "embauch[ée]e?|employ[ée]e?|enregistr[ée]e?|d[ée]pos[ée]e?|r[ée]uni[es]?|" +
  "prise? d'effet|entr[ée]e? en vigueur|dat[ée]e?|renouvel[ée]e?|r[ée]sili[ée]e?|" +
  "fix[ée]e?|remis[es]?|nomm[ée]e?|mut[ée]e?|admis[es]?|inscrit[es]?";
/** « à compter du », « avec effet au » : l'amorce porte déjà l'article. */
const ACT_LEAD = "[àa] compter|avec effet|jusqu'au|depuis le";
/** ⚠️ La date d'acte exige ses SÉPARATEURS, là où `DATE` tolère la soudure de l'OCR :
 *  « signé le20juin2024 » est de la prose agglutinée, pas une signature datée, et
 *  `gluedProse.test.ts` épingle qu'elle reste en clair. Le verbe garde la date ; le
 *  séparateur garde le verbe. */
const ACT_DATE =
  `(?:\\d{1,2}(?:er)?[^\\S\\r\\n]+(?:${MONTH})[^\\S\\r\\n]+\\d{4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;
// ⚠️ `\b` est ASCII en JS : « employ**é** » n'a pas de frontière après son accent, et
// « **é**tabli » n'en a pas devant — les deux verbes ne se déclenchaient jamais. Bornes
// Unicode des deux côtés (le piège que `engine/CLAUDE.md` documente pour `gate()`).
// L'article porte la même borne, sinon « établi **les** statuts » consomme le « le » de
// « les » et la règle échoue juste après.
const NOT_L = "(?![\\p{L}])";
const ACT_RE = new RegExp(
  `(?<![\\p{L}])(?:(?:${ACT_VERB})${NOT_L}[^\\S\\r\\n]*(?:[^\\S\\r\\n]*[\\p{L}']{1,12}){0,2}[^\\S\\r\\n]*` +
    `(?:le|du|au|en date du|à compter du)${NOT_L}|(?:${ACT_LEAD})${NOT_L})` +
    `[^\\S\\r\\n]*(?:(?:le|du|au)${NOT_L})?[^\\S\\r\\n]*(${ACT_DATE})`,
  "giu",
);
/** Le SECOND terme d'un intervalle (« du 03/01/2018 au 30/04/2024 ») : la première date
 *  est prise par la règle ci-dessus, la seconde n'a que « au » devant elle. */
const ACT_RANGE_RE = new RegExp(`(?:${ACT_DATE})[^\\S\\r\\n]*(?:au|jusqu'au|-|–)[^\\S\\r\\n]*(${ACT_DATE})`, "giu");
/** LONGUE PORTÉE — le même verbe d'acte, mais 3 à 8 mots avant la date (« ont établi
 *  les statuts de la SCI LES TROIS TILLEULS le 22/09/2023 ») : la portée courte
 *  ci-dessus s'arrête à 2 mots et laissait la date de constitution en clair. Plus la
 *  fenêtre s'allonge, plus l'autorité du verbe se dilue — la détection sort donc
 *  MARQUÉE « à vérifier » (masquée par défaut, dé-masquable d'un clic), au lieu
 *  d'exiger du regex court une précision qu'il n'a pas à cette distance. */
const ACT_RE_FAR = new RegExp(
  `(?<![\\p{L}])(?:${ACT_VERB})${NOT_L}(?:[^\\S\\r\\n]+[\\p{L}''-]{1,15}){3,8}[^\\S\\r\\n]+` +
    `(?:le|du|en date du)${NOT_L}[^\\S\\r\\n]*(${ACT_DATE})`,
  "giu",
);
/** La clôture notariale « Fait à VILLE, le 22/09/2023 » — « fait » est trop commun pour
 *  rejoindre ACT_VERB (« il l'a fait le … »), mais ANCRÉ sur « à + Ville capitalisée »,
 *  la forme est sans ambiguïté ; seule la DATE est émise (la ville est aux géo). */
const ACT_FAIT_RE = new RegExp(
  `(?<![\\p{L}])[Ff]aits?[^\\S\\r\\n]+[àa][^\\S\\r\\n]+\\p{Lu}[\\p{L}'’-]*(?:[ -]\\p{Lu}[\\p{L}'’-]*){0,3}[^\\S\\r\\n]*,?[^\\S\\r\\n]*le[^\\S\\r\\n]*(${ACT_DATE})`,
  "gu",
);

function detectActDates(text: string): Detection[] {
  const out: Detection[] = [];
  const seen = new Set<string>();
  const add = (value: string, start: number, uncertain?: boolean): void => {
    const v = value.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(uncertain ? { value: v, category: "DATE", start, uncertain } : { value: v, category: "DATE", start });
  };
  for (const m of text.matchAll(ACT_RE)) add(m[1] ?? "", m.index);
  for (const m of text.matchAll(ACT_FAIT_RE)) add(m[1] ?? "", m.index);
  // La longue portée APRÈS la courte : une date déjà tenue par le bras court garde sa
  // détection franche (le dédoublonnage par valeur fait foi), le flag ne s'ajoute
  // qu'aux dates que SEULE la fenêtre large atteint.
  for (const m of text.matchAll(ACT_RE_FAR)) add(m[1] ?? "", m.index, true);
  // L'intervalle n'est suivi que s'il OUVRE sur une date d'acte : sans cette borne,
  // deux horodatages voisins suffiraient à déclencher.
  for (const m of text.matchAll(ACT_RANGE_RE)) {
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (new RegExp(`(?:${ACT_VERB})(?![\\p{L}])[^\\S\\r\\n]*(?:le|du|au)?[^\\S\\r\\n]*$`, "iu").test(before))
      add(m[1] ?? "", m.index);
  }
  return out;
}
