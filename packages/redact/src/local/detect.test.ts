import { describe, it, expect } from "vitest";
import { detectLocalNer } from "./detect";
import { CharacterChunker, dedupe, type NerPredict, type LocalSpan } from "./chunker";
import { nerLabelToCategory } from "./labels";

/** Build a fake NER that reports every occurrence of `needle` with `label`. */
function predictOf(needle: string, label: string, score = 0.9): NerPredict {
  return (text: string) => {
    const out: LocalSpan[] = [];
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
      out.push({ start: i, end: i + needle.length, label, score });
    }
    return out;
  };
}

describe("nerLabelToCategory", () => {
  it("maps CoNLL entity labels to engine categories", () => {
    expect(nerLabelToCategory("PER")).toBe("NAME");
    expect(nerLabelToCategory("B-PER")).toBe("NAME");
    expect(nerLabelToCategory("ORG")).toBe("ORG");
    expect(nerLabelToCategory("LOC")).toBe("CITY");
    expect(nerLabelToCategory("I-loc")).toBe("CITY");
  });
  it("drops labels outside the target set (MISC, unknown, empty)", () => {
    expect(nerLabelToCategory("MISC")).toBe("");
    expect(nerLabelToCategory("DATE")).toBe("");
    expect(nerLabelToCategory("")).toBe("");
  });
});

describe("detectLocalNer", () => {
  it("returns verbatim spans with mapped categories", async () => {
    const text = "Appelle Jean Morvan chez Rebour SAS.";
    const found = await detectLocalNer(text, predictOf("Jean Morvan", "PER"));
    expect(found).toEqual([{ value: "Jean Morvan", category: "NAME" }]);
  });

  it("slices the ORIGINAL text, so a value is always present verbatim", async () => {
    const text = "Client: PARIS.";
    const [d] = await detectLocalNer(text, predictOf("PARIS", "LOC"));
    expect(text.includes(d.value)).toBe(true);
    expect(d).toEqual({ value: "PARIS", category: "CITY" });
  });

  it("drops labels outside the target set (e.g. MISC)", async () => {
    const found = await detectLocalNer("Un Français à Lyon.", predictOf("Français", "MISC"));
    expect(found).toEqual([]);
  });

  it("drops stopwords and generic type words the model over-flags", async () => {
    const text = "Voici mon CV et tes notes.";
    const cv = await detectLocalNer(text, predictOf("CV", "PER"));
    const stop = await detectLocalNer(text, predictOf("tes", "PER"));
    expect(cv).toEqual([]);
    expect(stop).toEqual([]);
  });

  it("dedupes the same value+category reported twice", async () => {
    const text = "Rebour et Rebour.";
    const found = await detectLocalNer(text, predictOf("Rebour", "ORG"));
    expect(found).toEqual([{ value: "Rebour", category: "ORG" }]);
  });

  it("keeps a 2-char CJK name but still drops a 2-char LATIN fragment", async () => {
    // A CJK glyph is a whole morpheme, so "张伟" (2 chars) is a full name — the <3
    // drop is Latin-only; a 2-char Latin fragment ("IE") stays dropped.
    const zh = await detectLocalNer("客户张伟先生。", predictOf("张伟", "PER"));
    expect(zh).toEqual([{ value: "张伟", category: "NAME" }]);
    const ko = await detectLocalNer("신청자 김민준.", predictOf("김민준", "PER"));
    expect(ko).toEqual([{ value: "김민준", category: "NAME" }]);
    const latin = await detectLocalNer("Les INGÉNIEURS.", predictOf("IE", "PER"));
    expect(latin).toEqual([]);
  });

  it("expands a detected entity to its OTHER casings in the text (no leak)", async () => {
    // The NER tags ONLY the exact casing it saw ("Karl studio"); the text also holds a
    // Title-case "Karl Studio". Without case expansion the untagged casing is never a
    // candidate → `pseudonymize` (case-sensitive apply) leaves it in clear → LEAK.
    const text = "La société Karl studio est présidée. Le client Karl Studio confirme.";
    const found = await detectLocalNer(text, predictOf("Karl studio", "ORG"));
    const values = found.map((d) => d.value).sort();
    expect(values).toContain("Karl studio");
    expect(values).toContain("Karl Studio");
    expect(found.every((d) => d.category === "ORG")).toBe(true);
  });

  it("does not match a casing glued inside a larger word", async () => {
    // "PARIS" tagged; "parisienne" must NOT become a candidate (whole-word guard).
    const text = "à PARIS, une boutique parisienne.";
    const found = await detectLocalNer(text, predictOf("PARIS", "LOC"));
    expect(found.map((d) => d.value)).toEqual(["PARIS"]);
  });

  it("honours the threshold gate", async () => {
    const text = "Contact Alice Doe.";
    const low = predictOf("Alice Doe", "PER", 0.1);
    expect(await detectLocalNer(text, low, { threshold: 0.5 })).toEqual([]);
    expect(await detectLocalNer(text, low, { threshold: 0.05 })).toEqual([
      { value: "Alice Doe", category: "NAME" },
    ]);
  });

  it("never throws — a failing predict degrades to []", async () => {
    const boom: NerPredict = () => {
      throw new Error("weights not loaded");
    };
    let captured = "";
    const found = await detectLocalNer("Jean Morvan", boom, {
      onError: (e) => (captured = e instanceof Error ? e.message : String(e)),
    });
    expect(found).toEqual([]);
    expect(captured).toBe("weights not loaded");
  });

  it("re-offsets spans across chunk boundaries into original coordinates", async () => {
    // Force multiple windows: chunkSize 20 splits this at a space.
    const text = "aaaa bbbb cccc dddd Zoe Welby eeee ffff";
    const found = await detectLocalNer(text, predictOf("Zoe Welby", "PER"), {
      chunkSize: 20,
      chunkOverlap: 10,
    });
    expect(found).toEqual([{ value: "Zoe Welby", category: "NAME" }]);
  });
});

describe("chunker", () => {
  it("dedupe keeps the higher-scoring overlapping span", () => {
    const spans: LocalSpan[] = [
      { start: 0, end: 10, label: "PER", score: 0.5 },
      { start: 2, end: 10, label: "PER", score: 0.9 },
    ];
    expect(dedupe(spans)).toEqual([{ start: 2, end: 10, label: "PER", score: 0.9 }]);
  });

  it("chunks long text with overlap and single-passes short text", async () => {
    const c = new CharacterChunker({ chunkSize: 10, chunkOverlap: 3 });
    const calls: string[] = [];
    await c.predict("one two three four five", (t) => {
      calls.push(t);
      return [];
    });
    expect(calls.length).toBeGreaterThan(1);
  });
});

describe("surname extension (extendNames)", () => {
  it("extends a detected first name over an untagged Capitalized surname", async () => {
    // The cased model tags only "Manon"; the post-pass recovers the surname "Verdolini".
    const text = "Prépare le contrat pour Manon Verdolini du cabinet Vaneau.";
    const found = await detectLocalNer(text, predictOf("Manon", "PER"));
    expect(found).toEqual([{ value: "Manon Verdolini", category: "NAME" }]);
  });

  it("stops at a lowercase word (never crosses into ordinary prose)", async () => {
    const text = "Appelle Manon chez le notaire.";
    const found = await detectLocalNer(text, predictOf("Manon", "PER"));
    expect(found).toEqual([{ value: "Manon", category: "NAME" }]);
  });

  it("stops at a country word (does not swallow a place as a surname)", async () => {
    const text = "Manon France repart demain.";
    const found = await detectLocalNer(text, predictOf("Manon", "PER"));
    expect(found).toEqual([{ value: "Manon", category: "NAME" }]);
  });

  it("does not extend a non-person (ORG/LOC) span", async () => {
    const text = "Le cabinet Rebour Legal conseille.";
    const found = await detectLocalNer(text, predictOf("Rebour", "ORG"));
    expect(found).toEqual([{ value: "Rebour", category: "ORG" }]);
  });

  it("can be disabled", async () => {
    const text = "Manon Verdolini arrive.";
    const found = await detectLocalNer(text, predictOf("Manon", "PER"), { extendNames: false });
    expect(found).toEqual([{ value: "Manon", category: "NAME" }]);
  });
});

describe("MISC re-admission (miscThreshold)", () => {
  it("keeps MISC dropped by default", async () => {
    const found = await detectLocalNer("Le contrat Kelm démarre.", predictOf("Kelm", "MISC", 0.97));
    expect(found).toEqual([]);
  });

  it("re-admits a confident proper-noun MISC as ORG above the threshold", async () => {
    const found = await detectLocalNer("Le contrat Kelm démarre.", predictOf("Kelm", "MISC", 0.97), {
      miscThreshold: 0.9,
    });
    expect(found).toEqual([{ value: "Kelm", category: "ORG" }]);
  });

  it("still drops a MISC below the threshold", async () => {
    const found = await detectLocalNer("Le contrat Kelm démarre.", predictOf("Kelm", "MISC", 0.7), {
      miscThreshold: 0.9,
    });
    expect(found).toEqual([]);
  });

  it("never re-admits a COUNTRY mis-tagged MISC, even above the threshold", async () => {
    const found = await detectLocalNer("Bientôt la France entière.", predictOf("France", "MISC", 0.99), {
      miscThreshold: 0.9,
    });
    expect(found).toEqual([]);
  });

  it("never re-admits a lowercase (non-proper-noun) MISC", async () => {
    const found = await detectLocalNer("un truc bidule ici.", predictOf("bidule", "MISC", 0.99), {
      miscThreshold: 0.9,
    });
    expect(found).toEqual([]);
  });
});
