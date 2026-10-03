import { describe, expect, it } from "vitest";
import { foldText, occurrences, occurrencesNaive } from "./textOccurrences";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Tiny deterministic PRNG: the fuzz must be the same run in CI and locally.
function rng(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % n;
  };
}

// Every piece the reference regex treats specially: blanks vs other spaces, word
// punctuation, case pairs whose fold is not plain lowercase (ſ/s, K Kelvin/k, ẞ/ß, σ/ς/Σ),
// combining marks, digits, astral letters with case (𐐀/𐐨) and an astral non-word.
const PIECES = [
  " ", " ", "\t", "\n", ".", ",", "'", "’", "-", "son", "Son", "SON", "John", "john",
  "ſon", "Kelvin", "Kelvin", "ß", "ẞ", "σ", "ς", "Σ", "é", "é", "35000", "à", "𐐀", "𐐨", "😀",
  "Pôle", "emploi", "Emploi", "d'", "lourdes", " ",
];
const VALUES = ["son", "SON", "john", "ss", "ß", "σ", "kelvin", "emploi", "lourdes", "𐐨", "'", "é", "-"];

describe("occurrences — identical to the reference regex", () => {
  it("on adversarial random text, for every value", () => {
    const r = rng(7);
    let seen = 0;
    for (let doc = 0; doc < 400; doc++) {
      let text = "";
      const len = 1 + r(40);
      for (let k = 0; k < len; k++) text += PIECES[r(PIECES.length)];
      for (const v of VALUES) {
        const want = occurrencesNaive(v, text);
        seen += want.length;
        expect(occurrences(v, text), `${JSON.stringify(v)} in ${JSON.stringify(text)}`).toEqual(want);
      }
    }
    // The fuzz must actually exercise matches, not compare empty lists.
    expect(seen).toBeGreaterThan(1000);
  });

  it("on the cases the gates were written for", () => {
    const text = "Offre Raisonnable d'Emploi, Pôle  emploi\tà Rennes; sonson Johnson — 35000 rennes";
    for (const v of ["emploi", "Emploi", "rennes", "son", "Pôle emploi", "35000"])
      expect(occurrences(v, text)).toEqual(occurrencesNaive(v, text));
  });

  it("the case fold never separates two characters the regex treats as equal (whole BMP)", () => {
    let bmp = "";
    for (let c = 1; c < 0x10000; c++) if (c < 0xd800 || c > 0xdfff) bmp += String.fromCharCode(c);
    const folded = foldText(bmp);
    expect(folded.length).toBe(bmp.length);
    const fold = (ch: string) => foldText(ch);
    // Every character that has a case mapping, or whose fold differs from itself: the
    // regex's equivalence classes are probed from each of them over the whole BMP.
    const probes = [...bmp].filter((ch) => ch.toUpperCase() !== ch || ch.toLowerCase() !== ch || fold(ch) !== ch);
    let split = 0;
    for (const ch of probes)
      for (const m of bmp.matchAll(new RegExp(esc(ch), "giu"))) if (fold(m[0]) !== fold(ch)) split++;
    expect(split).toBe(0);
  });
});
