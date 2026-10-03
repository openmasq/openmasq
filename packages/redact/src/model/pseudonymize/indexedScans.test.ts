import { describe, expect, it } from "vitest";
import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";
import { longPasteDoc } from "../../__cases__/longPasteDoc";
import { positionsOf } from "../../positions";
import { caseInsensitiveOccurrences, escapeRegExp, isCjkText, isWordGlued } from "../../util";
import { detectEmailSpans, occursOutsideUrl } from "../../engine/urls";
import { SUF, SUF_LONG } from "../../engine/addresses/shapes";
import { extendEdges } from "./extendEdges";
import { deNest } from "./filter";
import { dropLineNoise } from "./lineContext";
import { substringTest } from "./substringIndex";

/**
 * The long-paste indexes (`positions.ts`, `substringIndex.ts`, the memoised gates) change
 * HOW the pipeline searches a long text, never WHAT it finds. Each is diffed here against
 * the straightforward scan it replaced, on texts long enough to take the indexed path
 * (≥ 20k characters) and on adversarial ones (overlaps, repeats, case variants).
 */
function rng(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % n;
  };
}
const { text: DOC, detections: NER } = longPasteDoc(60_000, 3);
// A long text over a tiny alphabet: overlapping and repeated occurrences everywhere.
const r = rng(11);
let NOISE = "";
while (NOISE.length < 30_000) NOISE += ["aa", "ab", "a", " ", "b", "aab", "Aa", "\n"][r(8)];

describe("positionsOf ≡ the indexOf walk", () => {
  const walk = (hay: string, needle: string) => {
    const out: number[] = [];
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i);
    return out;
  };
  it("on a long document and on a long adversarial text", () => {
    for (const n of ["Springfield", "son", "Main Street, ", "@lawfirm1", "zzzzz", "2023, ", "\n\n1"])
      expect(positionsOf(DOC, n)).toEqual(walk(DOC, n));
    for (const n of ["aaaa", "aab a", "abab", "a aa", "Aa a", "b\naa", "aaaaaaaa"])
      expect(positionsOf(NOISE, n)).toEqual(walk(NOISE, n));
  });
});

describe("substringTest ≡ includes", () => {
  it("answers exactly, YES and NO", () => {
    const has = substringTest(DOC);
    for (const c of ["Springfield", "Oslen Group", "Acme Holdings LLC", "acme holdings llc", "x", "Main", "Brivet Partners"])
      expect(has(c)).toBe(DOC.includes(c));
  });
});

describe("caseInsensitiveOccurrences ≡ the lowercase walk", () => {
  const ref = (input: string, value: string): string[] => {
    const hay = input.toLowerCase();
    const needle = value.toLowerCase();
    if (hay.length !== input.length || needle.length !== value.length) return input.includes(value) ? [value] : [];
    const out: string[] = [];
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
      const actual = input.slice(i, i + value.length);
      if (!isCjkText(actual) && isWordGlued(input, i, actual)) continue;
      if (!out.includes(actual)) out.push(actual);
    }
    return out;
  };
  it("on the long document and the adversarial text", () => {
    for (const v of ["springfield", "JOHN SMITH", "son", "lawfirm1", "main street"]) expect(caseInsensitiveOccurrences(DOC, v)).toEqual(ref(DOC, v));
    for (const v of ["aa", "AAB", "a a", "aaaa"]) expect(caseInsensitiveOccurrences(NOISE, v)).toEqual(ref(NOISE, v));
  });
});

describe("occursOutsideUrl ≡ the span-by-span check", () => {
  const ref = (value: string, text: string, spans: ReadonlyArray<readonly [number, number]>) => {
    for (let from = 0; ; ) {
      const i = text.indexOf(value, from);
      if (i < 0) return false;
      if (!spans.some(([s, e]) => i < e && i + value.length > s)) return true;
      from = i + 1;
    }
  };
  it("against hundreds of e-mail spans", () => {
    const spans = detectEmailSpans(DOC);
    expect(spans.length).toBeGreaterThan(100);
    for (const v of [...new Set(NER.map((d) => d.value))].concat(["lawfirm1", "john.smith", ".com", "Counsel"]))
      expect(occursOutsideUrl(v, DOC, spans)).toBe(ref(v, DOC, spans));
  });
});

describe("extendEdges ≡ the per-candidate scans", () => {
  const STREET_END = new RegExp(`(?:^|[\\s'’-])(?:${SUF}|${SUF_LONG})\\.?$`, "iu");
  const ADDRESS = new Set(["ADDRESS", "LOCATION", "LOC", "CITY", "PLACE", "GEO", "NAME"]);
  const ORGS = new Set(["ORG", "ORGANIZATION", "ORGANISATION", "COMPANY", "EMPLOYER"]);
  const ref = (input: string, candidates: Detection[]): Detection[] => {
    const out: Detection[] = [];
    const have = new Set(candidates.map((c) => `${c.category}::${c.value}`));
    const add = (value: string, category: string) => {
      if (have.has(`${category}::${value}`)) return;
      have.add(`${category}::${value}`);
      out.push({ value, category });
    };
    for (const c of candidates) {
      if (ADDRESS.has(c.category.toUpperCase()) && /^\p{L}/u.test(c.value) && STREET_END.test(c.value)) {
        const m = new RegExp(`(?<![\\p{L}\\p{N}/-])(\\d{1,5}[A-Za-z]?(?:[-/]\\d{1,4})?)[ \\u00A0]+${escapeRegExp(c.value)}(?![\\p{L}\\p{N}])`, "u").exec(input);
        if (m) add(`${m[1]} ${c.value}`, "ADDRESS");
      }
    }
    const orgs = candidates.filter((c) => ORGS.has(c.category.toUpperCase()) && c.value.length >= 3);
    for (const a of orgs)
      for (const b of orgs)
        if (a !== b && a.value !== b.value && input.includes(`${a.value} ${b.value}`)) add(`${a.value} ${b.value}`, a.category);
    return out;
  };
  it("on the long document, with repeated and touching candidates", () => {
    const text = `${DOC}\nheld at Lublin Remand Centre, 12B Rue du Lac and 4893 Justin Terrace; 1234567 Main Street; 7/2 Rue du Lac.`;
    const cands: Detection[] = [
      ...NER,
      { value: "Main Street", category: "ADDRESS" }, { value: "Main Street", category: "LOCATION" },
      { value: "Rue du Lac", category: "CITY" }, { value: "Justin Terrace", category: "CITY" },
      { value: "Lublin Remand", category: "ORG" }, { value: "Centre", category: "ORG" },
      { value: "Centre", category: "COMPANY" }, { value: "Lublin Remand", category: "ORG" },
      { value: "Blue Harbor", category: "ORG" }, { value: "Capital", category: "COMPANY" },
    ];
    const got = extendEdges(text, cands);
    expect(got.length).toBeGreaterThan(2);
    expect(got).toEqual(ref(text, cands));
  });
});

describe("deNest and dropLineNoise judge each value once — same verdicts", () => {
  const refDeNest = (kept: Detection[], input: string): Detection[] => {
    const specific = new Set(kept.filter((c) => redactionCategory(c.category) !== "apikey").map((c) => c.value));
    const k = kept.filter((c) => !(redactionCategory(c.category) === "apikey" && specific.has(c.value)));
    return k.filter((c) => {
      const supers = k.filter((o) => o.value.length > c.value.length && o.value.includes(c.value));
      if (!supers.length) return true;
      let masked = input;
      for (const s of supers) masked = masked.split(s.value).join(" ".repeat(s.value.length));
      return masked.includes(c.value);
    });
  };
  it("deNest on the long document, nested and repeated values included", () => {
    const cands: Detection[] = [
      ...NER, { value: "Smith", category: "name" }, { value: "Springfield", category: "location" },
      { value: "Main Street, Springfield", category: "address" }, { value: "lawfirm1", category: "company" },
      ...NER.slice(0, 50),
    ];
    expect(deNest(cands, DOC)).toEqual(refDeNest(cands, DOC));
  });
  it("dropLineNoise: the batch verdict equals each candidate judged alone", () => {
    const text = `CONFIDENTIAL\nJohn Smith\n\n${DOC}\nMary Brown\n:20:ABCDEF123456\n`;
    const cands: Detection[] = [...NER.slice(0, 200), { value: "Mary Brown", category: "name" }, { value: "ABCDEF123456", category: "apikey" }];
    expect(dropLineNoise(cands, text)).toEqual(cands.filter((c) => dropLineNoise([c], text).length === 1));
  });
});
