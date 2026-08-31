// The address COMPLEMENT — « Résidence Les Chênes », « appartement 12B », « Bât. C »,
// « escalier 3 » — the line written BEFORE the street, which the shapes in `addresses.ts`
// cannot see: they anchor on a number + a street type, and a
// complement has neither.
//
// Reported on 11/08: « Résidence Les Chênes, appartement 12B, 5 allée Verte, 69003 Lyon »
// came back with the street, postal code and city faked — and the residence and
// apartment number in CLEAR. And that's exactly what identifies the household once the
// street is replaced: in a small commune, « Résidence Les Chênes appartement 12B » is enough
// to find someone.
//
// ⚠️ THE GATE IS ADJACENCY, not the keyword. « appartement » alone is a common noun
// (« il cherche un appartement »), and a bare keyword would contradict the engine's
// precision bar. A chunk is only kept if it TOUCHES an already-detected address — same line,
// separated from it only by `,`/spaces (or by other chained complements). So it
// never creates a detection where there isn't already an address.
import type { Detection } from "../types";
import { fakeHandle } from "../model/fakes/primitives";

/** The words that open a complement. Abbreviations included: that's how
 *  an address is written on an envelope. The trailing period is optional (« Bât. » / « Bat »). */
const KEYWORD =
  "r[ée]sidence|r[ée]s|b[âa]timent|b[âa]t|immeuble|appartement|appart|appt|apt|" +
  "escalier|esc|[ée]tage|porte|lot|entr[ée]e|chez";

/** A chunk: the keyword + its short value, which stops at the comma or end of
 *  line. The value stays bounded (≤ 30 characters) — beyond that we're no longer in a complement
 *  but in a sentence. */
const CHUNK = `(?:${KEYWORD})\\.?[^\\S\\r\\n]+[\\p{L}\\p{N}][\\p{L}\\p{N}'’\\-. ]{0,29}`;

/** A CHAIN of chunks glued to what follows: « Résidence X, appartement Y, ». */
const TRAILING_CHAIN = new RegExp(`(?:${CHUNK})(?:[^\\S\\r\\n]*,[^\\S\\r\\n]*(?:${CHUNK}))*[^\\S\\r\\n]*,?[^\\S\\r\\n]*$`, "iu");

/**
 * …and the chain that FOLLOWS the address: « 2 mail Camille du Gast, 92600, Asnières,
 * appartement A02 ». Measured on 16/08/2026 on a REAL lease — this file only looked at
 * the BEFORE (« the line written BEFORE the street »), while the document, itself, writes it AFTER.
 * Same consequence, word for word, as the one that gave rise to this detector: street, postal
 * code and city faked, apartment number in clear.
 *
 * ⚠️ The TRAILING chunk is STRICTER than the one preceding it, and the asymmetry is
 * intentional: what FOLLOWS an address is most often a sentence (« …, 69003 Lyon, entrée
 * libre de 9h à 18h »), where what precedes it is an address line. It must therefore be
 * a CODE — the keyword then a SINGLE alphanumeric token carrying a digit. Two things
 * follow from this, and both are necessary: « entrée libre » doesn't pass (no digit),
 * and the value cannot overflow onto the rest of the line — the real document writes
 * « appartement A02 Loyer de 650 eur » WITHOUT a comma, and a greedy value would have carried off
 * the rent. Over-redacting is a product failure (the precision bar in `CLAUDE.md`): we
 * prefer to miss a trailing « bâtiment C », a form the BEFORE side already covers.
 */
const TRAIL_CHUNK = `(?:${KEYWORD})\\.?[^\\S\\r\\n]+[\\p{L}\\p{N}]{1,10}`;
// ⚠️ ONE line wrap is tolerated BEFORE the chunk, and only one: an address block
// wraps (« …, 92600, Asnières,\nappartement A02 » — measured on the broker persona, where the
// complement was going out IN CLEAR for this reason alone). It's the same trade-off as the `W`
// join in address shapes: what allows the wrap is that the KEYWORD anchors the chunk —
// nothing else can slip in — and here the requirement of a digit-bearing code token is added on top.
const LEADING_CHAIN = new RegExp(
  `^[^\\S\\r\\n]*,?(?:[^\\S\\r\\n]*\\r?\\n)?[^\\S\\r\\n]*(?:${TRAIL_CHUNK})(?:[^\\S\\r\\n]*,[^\\S\\r\\n]*(?:${TRAIL_CHUNK}))*`,
  "iu",
);
const hasDigit = (chunk: string): boolean => /\d/.test(chunk.split(/\s+/).slice(1).join(" "));

/**
 * The complements that IMMEDIATELY PRECEDE a detected address.
 *
 * `addresses` must carry the address detections with their `start` (those from
 * `detectAddresses`): that's the anchor. Each chunk becomes its own
 * `ADDRESS` detection, in the country of the address it complements — so faked along with it.
 */
export function detectAddressComplements(text: string, addresses: Detection[]): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const addr of addresses) {
    if (addr.category !== "ADDRESS" || addr.start == null) continue;
    // AFTER the address — stricter (see `TRAIL_CHUNK` + `hasDigit`), and at most ONE wrap.
    const end = addr.start + addr.value.length;
    const wrap = text.indexOf("\n", end);
    const secondEol = wrap === -1 ? -1 : text.indexOf("\n", wrap + 1);
    const lineEnd = wrap === -1 ? text.length : secondEol === -1 ? text.length : secondEol;
    const apres = LEADING_CHAIN.exec(text.slice(end, lineEnd));
    if (apres) {
      for (const m of apres[0].matchAll(new RegExp(TRAIL_CHUNK, "giu"))) {
        const value = m[0].replace(/[\s,.]+$/, "");
        if (value.length < 5 || !hasDigit(value)) continue;
        const key = `ADDRESS::${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value, category: "ADDRESS", country: addr.country, start: end + apres.index + m.index });
      }
    }
    // The text from the start of the address's LINE to its first character.
    const lineStart = text.lastIndexOf("\n", addr.start - 1) + 1;
    const before = text.slice(lineStart, addr.start);
    if (!before.trim()) continue;
    const chain = TRAILING_CHAIN.exec(before);
    if (!chain) continue;
    // Each chunk of the chain, in isolation: one fake per complement, like for the
    // rest — a single span « Résidence X, appartement Y » would give one fake whose
    // internal punctuation would be invented.
    for (const m of chain[0].matchAll(new RegExp(CHUNK, "giu"))) {
      const value = m[0].replace(/[\s,.]+$/, "");
      if (value.length < 5) continue;
      // ⚠️ PROSE's tell is the indefinite article: « il cherche un appartement
      // 3 pièces, 12 rue de la Paix » is not a three-line address. An
      // address complement doesn't introduce itself, it's written flat.
      const head = chain[0].slice(0, m.index).trimEnd();
      const beforeChunk = head ? head : before.slice(0, chain.index).trimEnd();
      if (/\b(?:un|une|des|du|le|la|les|ce|cet|cette|mon|ma|notre|leur)$/i.test(beforeChunk)) continue;
      // A designation fits in three words (« Les Chênes », « 12B », « C »); beyond that
      // we're reading a sentence that starts with the keyword.
      if (value.split(/\s+/).length > 4) continue;
      const key = `ADDRESS::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        value,
        category: "ADDRESS",
        country: addr.country,
        start: lineStart + chain.index + m.index,
      });
    }
  }
  return out;
}

/**
 * The FAKE of a complement — the keyword STAYS, the code changes.
 *
 * ⚠️ Without it, « appartement A02 » got « 27 CHEMIN des Tilleuls »: the category is
 * ADDRESS, and the ADDRESS branch always builds a STREET. A fake must be of the same
 * nature as the value (`model/CLAUDE.md`) — a complement that becomes a street invents a
 * second place where the document named only one, and the model reasons on it.
 *
 * BOUNDED TO THE CODE CASE, on purpose: only if the tail carries a digit. « Résidence Les
 * Chênes » is a NAME, and letter-by-letter scrambling would turn it into an unreadable word; this
 * case keeps the previous path, unchanged. `fakeHandle` preserves each character's
 * class (digit → digit, uppercase → uppercase), so « A02 » stays a believable
 * apartment code.
 */
export function fakeAddressComplement(value: string, seed: number): string | null {
  const m = new RegExp(`^((?:${KEYWORD})\\.?[^\\S\\r\\n]+)(.+)$`, "iu").exec(value.trim());
  if (!m || !/\d/.test(m[2])) return null;
  const fake = fakeHandle(m[2], seed);
  // « escalier 0 » doesn't exist: a leading zero only reads as a code if
  // the original carried one (« porte 03 »). `fakeHandle` draws digits uniformly,
  // so it has to be told.
  const zéroteté = fake.startsWith("0") && !m[2].startsWith("0");
  return m[1] + (zéroteté ? String(1 + (seed % 9)) + fake.slice(1) : fake);
}
