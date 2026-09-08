/**
 * REPHRASED forms of a redacted date — the "dates" counterpart of `placeFragments`.
 *
 * ⚠️ The vault associates exact VALUES, and the model rewrites: a fake `13/08/2024`
 * copied verbatim into a table restores fine, but the SAME date spelled out in
 * words in the sentence next to it (« du 13 août 2024 au… ») is the key to nothing — and
 * the user reads a FALSE date presented as a fact about their own file,
 * all the more credible because the rest of the document is correct (seen 15/08, a
 * document-clerk inventory). This is not the known DERIVATION limit (a computed age):
 * it's the same value, in a different format — hence restorable, deterministically.
 *
 * For every vault entry whose fake AND real value are both `dd/mm/yyyy` dates, we
 * derive the pairs "long form of the fake → long form of the real". Derived at
 * READ time, at restitution (`unredact`), like `placeFragments`: no
 * stored vault is rewritten, and an existing entry always wins.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

interface Parsed {
  day: number;
  month: number; // 1-12
  year: string;
}

function parse(v: string): Parsed | null {
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, year: m[3] };
}

/** The French display form: day without a leading zero (« 1er » for the first). */
function longForm(p: Parsed): string {
  const day = p.day === 1 ? "1er" : String(p.day);
  return `${day} ${MOIS[p.month - 1]} ${p.year}`;
}

/** The DAY spellings the model actually uses: « 5 », « 05 », « 1er ». */
function dayForms(day: number): string[] {
  const forms = [String(day)];
  if (day < 10) forms.push(`0${day}`);
  if (day === 1) forms.push("1er");
  return forms;
}

/**
 * The derived `[fakeLong, realLong]` pairs for a vault entry, or `[]` when either
 * of the two values isn't a `dd/mm/yyyy` date. The real value keeps ONE canonical form
 * (day without a zero); the fake covers the model's plausible spellings. The accent in
 * « août » is already tolerated by the restitution pattern (`accentTolerantSource`).
 */
export function dateReformPairs(fake: string, real: string): Array<[string, string]> {
  const pf = parse(fake);
  const pr = parse(real);
  if (!pf || !pr) return [];
  const realLong = longForm(pr);
  return dayForms(pf.day).map((d) => [`${d} ${MOIS[pf.month - 1]} ${pf.year}`, realLong]);
}
