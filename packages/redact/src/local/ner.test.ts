import { describe, it, expect, vi } from "vitest";
import { createNerPredict, type NerPipeline } from "./ner";
import { detectLocalNer } from "./detect";

/** A fake token-classification pipeline: reports a PER entity for any known name
 *  present in the text it RECEIVES (expects proper/title case, like a real cased
 *  model), so the test can assert the case-normalisation variant is fed. */
function fakePipeline(known: string[]): NerPipeline {
  return (text: string) => {
    const out = [];
    for (const n of known) {
      if (text.includes(n)) out.push({ entity_group: "PER", word: n, score: 0.99 });
    }
    return out;
  };
}

describe("createNerPredict — case normalisation", () => {
  it("feeds a title-cased variant for ALL-CAPS text and maps the span back to the ORIGINAL case", async () => {
    const pipe = vi.fn(fakePipeline(["Sabourdin"]));
    const predict = await createNerPredict({ pipeline: pipe });
    // Caps run (≥2 all-caps words) → the model only recognises the title-cased pass.
    // `extendNames:false` keeps this focused on case-normalisation — the surname
    // post-pass (which would also pull in "REBOUR") is exercised in `detect.test.ts`.
    const found = await detectLocalNer("SABOURDIN REBOUR SARL", predict, { extendNames: false });
    expect(found).toEqual([{ value: "SABOURDIN", category: "NAME" }]); // original casing kept
    // Called twice: once on the original, once on the title-cased variant.
    expect(pipe).toHaveBeenCalledTimes(2);
    expect(pipe.mock.calls.some((c) => String(c[0]).includes("Sabourdin"))).toBe(true);
  });

  it("feeds a title-cased variant for all-lowercase prose", async () => {
    const pipe = vi.fn(fakePipeline(["Jean Valjean"]));
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("je m'appelle jean valjean aujourd'hui", predict);
    expect(found).toEqual([{ value: "jean valjean", category: "NAME" }]);
    expect(pipe).toHaveBeenCalledTimes(2);
  });

  it("re-cases a LONE all-caps word (≥1 caps word now triggers the variant)", async () => {
    const pipe = vi.fn(fakePipeline(["Rebour"]));
    const predict = await createNerPredict({ pipeline: pipe });
    // A single uppercase surname in otherwise normal text — the old ≥2 threshold
    // missed it (1 pass), so "REBOUR" leaked.
    const found = await detectLocalNer("Merci de contacter REBOUR rapidement", predict);
    expect(found).toEqual([{ value: "REBOUR", category: "NAME" }]); // original casing kept
    expect(pipe).toHaveBeenCalledTimes(2); // original + title-cased variant
  });

  it("re-cases lowercase typing behind a conventional sentence capital ('Je suis augustin vaudel')", async () => {
    const pipe = vi.fn(fakePipeline(["Augustin Vaudel"]));
    const predict = await createNerPredict({ pipeline: pipe });
    // The sentence-initial "J" used to push the uppercase ratio over the recase floor,
    // so the title-cased pass never ran and the lowercase name shipped in clear.
    const found = await detectLocalNer("Je suis augustin vaudel", predict);
    expect(found).toEqual([{ value: "augustin vaudel", category: "NAME" }]); // original casing kept
    expect(pipe).toHaveBeenCalledTimes(2); // original + title-cased variant
  });

  it("re-cases a multi-sentence lowercase paragraph (each sentence capital excluded)", async () => {
    const pipe = vi.fn(fakePipeline(["Augustin Vaudel"]));
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer(
      "Bonjour. Je voulais te prévenir que augustin vaudel passera demain. Merci d'avance !",
      predict,
    );
    expect(found).toEqual([{ value: "augustin vaudel", category: "NAME" }]);
    expect(pipe).toHaveBeenCalledTimes(2);
  });

  it("does NOT re-case already well-cased prose (single pass, no regression)", async () => {
    const pipe = vi.fn(fakePipeline(["Jean Valjean"]));
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Je m'appelle Jean Valjean aujourd'hui", predict);
    expect(found).toEqual([{ value: "Jean Valjean", category: "NAME" }]);
    expect(pipe).toHaveBeenCalledTimes(1); // no title-case variant needed
  });

  it("locates a name the model aggregated with a space but the text SPLIT across a line break", async () => {
    // Real model behaviour on a wrapped PDF/form: it aggregates "Jean\nRebour" into the
    // single-spaced word "Jean Rebour". The old locate() (verbatim, then whitespace-stripped)
    // matched NEITHER "jean rebour" nor "jeandupont" against "jean\nrebour" → the whole entity
    // was DROPPED. Now the \s+ fallback finds the REAL span, verbatim (newline preserved).
    const pipe: NerPipeline = (text) =>
      /Jean\s+Rebour/.test(text) ? [{ entity_group: "PER", word: "Jean Rebour", score: 0.99 }] : [];
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Client :\nJean\nRebour\nMerci", predict);
    expect(found).toEqual([{ value: "Jean\nRebour", category: "NAME" }]);
  });

  it("still returns null (drops) when the tokens are NOT both present (no mislocate)", async () => {
    const pipe: NerPipeline = () => [{ entity_group: "PER", word: "Jean Rebour", score: 0.99 }];
    const predict = await createNerPredict({ pipeline: pipe });
    // Model hallucinates "Jean Rebour" but only "Jean" is in the text → not verbatim → dropped.
    const found = await detectLocalNer("Seulement Jean est là.", predict);
    expect(found).toEqual([]);
  });

  it("drops a generic word behind a CAPITALIZED article ('La réunion' is a meeting, not a place)", async () => {
    // The recase pass makes the model tag "La Réunion" as a LOC; stripLeadingArticle
    // keeps a capitalized article ("Le Mans" rule) so the generic drop never saw
    // "réunion" — and the word for "meeting" was redacted across business prose.
    const pipe: NerPipeline = (text) =>
      /La R[ée]union/i.test(text) ? [{ entity_group: "LOC", word: "La Réunion", score: 0.9 }] : [];
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("La réunion aura lieu jeudi prochain vraiment", predict);
    expect(found).toEqual([]);
  });

  it("maps entity_group labels through nerLabelToCategory and drops MISC", async () => {
    const pipe: NerPipeline = (text) =>
      text.includes("Renault")
        ? [
            { entity_group: "ORG", word: "Renault", score: 0.9 },
            { entity_group: "MISC", word: "Renault", score: 0.9 },
          ]
        : [];
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Je bosse chez Renault.", predict);
    expect(found).toEqual([{ value: "Renault", category: "ORG" }]); // MISC dropped
  });
});

describe("createNerPredict — subword re-aggregation (none + mergeRuns)", () => {
  // A "none"-style (per-token) pipeline: transformers.js emits ONE entry per subword token,
  // each with a sequential `index`. mergeRuns groups consecutive-index same-type tokens —
  // fixing the cased model's habit of tagging every subword of a wrapped word `B-` (which
  // `aggregation_strategy: "simple"` would shatter into dropped fragments).
  const tokens =
    (arr: Array<[string, number, string]>): NerPipeline =>
    () =>
      arr.map(([entity, index, word]) => ({ entity, index, word, score: 0.95 }));

  it("merges subwords the model OVER-SPLIT into B- (Na·tha·lie → one name)", async () => {
    const pipe = tokens([
      ["B-PER", 3, "Na"],
      ["B-PER", 4, "tha"],
      ["I-PER", 5, "lie"],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Madame Nathalie est là.", predict);
    expect(found).toEqual([{ value: "Nathalie", category: "NAME" }]);
  });

  it("bridges a line break between subwords (wrapped PDF: 'Nathalie\\nCros')", async () => {
    const pipe = tokens([
      ["B-PER", 5, "Na"],
      ["B-PER", 6, "tha"],
      ["I-PER", 7, "lie"],
      ["I-PER", 8, "Cr"],
      ["I-PER", 9, "os"],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Remis à Nathalie\nCros hier.", predict);
    expect(found).toEqual([{ value: "Nathalie\nCros", category: "NAME" }]);
  });

  it("locates a CJK name written one glyph per line ('张\\n伟')", async () => {
    const pipe = tokens([
      ["B-PER", 2, "张"],
      ["I-PER", 3, "伟"],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("客户\n张\n伟\n电话", predict);
    expect(found).toEqual([{ value: "张\n伟", category: "NAME" }]);
  });

  it("does NOT merge across a token-index GAP (an O token between two names)", async () => {
    // "Jean"(idx0) … O(idx1) … "Marie"(idx2): non-consecutive → two SEPARATE entities,
    // never one fused "Jean Marie" span.
    const pipe = tokens([
      ["B-PER", 0, "Jean"],
      ["B-PER", 2, "Marie"],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Jean et Marie", predict);
    expect(found).toEqual([
      { value: "Jean", category: "NAME" },
      { value: "Marie", category: "NAME" },
    ]);
  });
});

describe("createNerPredict — ## continuation merge across labels", () => {
  // Per-token stream with EXPLICIT scores (the label vote needs them) and `##` WordPiece
  // markers — how the cased model splits a rare proper noun it then tags inconsistently.
  const stream =
    (arr: Array<[entity: string, index: number, word: string, score: number]>): NerPipeline =>
    () =>
      arr.map(([entity, index, word, score]) => ({ entity, index, word, score }));

  it("merges a ## continuation across a LABEL change, taking the score-weighted label", async () => {
    // A rare proper noun split in two with DISAGREEING labels: Van[PER 0.79] + ##eau[ORG 0.71].
    // One span, PER out-votes ORG → NAME — not a dropped 3-char "Van" + 3-char "eau" fragment.
    const pipe = stream([
      ["PER", 1, "Van", 0.79],
      ["ORG", 2, "##eau", 0.71],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Le cabinet Vaneau conseille.", predict, { extendNames: false });
    expect(found).toEqual([{ value: "Vaneau", category: "NAME" }]);
  });

  it("absorbs an O-labelled ## continuation (whole word, not a dropped fragment)", async () => {
    // "Kelm" → Ke[PER 0.66] + ##lm[O]: the O continuation is part of the word, so it merges
    // in and the run keeps the lead's PER label → the whole "Kelm" is recovered.
    const pipe = stream([
      ["PER", 1, "Ke", 0.66],
      ["O", 2, "##lm", 0.99],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Le contrat Kelm démarre.", predict, { extendNames: false });
    expect(found).toEqual([{ value: "Kelm", category: "NAME" }]);
  });

  it("does NOT fuse a NON-## token at a gap (only real continuations glue)", async () => {
    // A separate 1-char ORG letter at a non-consecutive index stays its own (dropped)
    // entity — a stray token can never glue onto an adjacent name.
    const pipe = stream([
      ["PER", 1, "Marie", 0.98],
      ["ORG", 5, "X", 0.5],
    ]);
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Marie et X arrivent.", predict, { extendNames: false });
    expect(found).toEqual([{ value: "Marie", category: "NAME" }]);
  });
});

describe("« à vérifier » — accord des deux passes + score (le déclencheur mesuré)", () => {
  /** Like `fakePipeline`, but each known name carries its score — to drive the
   *  `disagreement AND score < 0.99` trigger pass by pass (the casing of the known name
   *  decides WHICH pass sees it). */
  function scoredPipeline(known: Record<string, number>): NerPipeline {
    return (text: string) => {
      const out = [];
      for (const [n, score] of Object.entries(known)) {
        if (text.includes(n)) out.push({ entity_group: "PER", word: n, score });
      }
      return out;
    };
  }

  it("désaccord + score faible ⇒ uncertain (une seule passe l'a vu)", async () => {
    // ALL-CAPS text ⇒ the 2nd recased pass is armed; only the title-cased one matches.
    const predict = await createNerPredict({ pipeline: scoredPipeline({ Sabourdin: 0.7 }) });
    const found = await detectLocalNer("SABOURDIN REBOUR SARL", predict, { extendNames: false });
    expect(found).toEqual([{ value: "SABOURDIN", category: "NAME", uncertain: true }]);
  });

  it("accord des deux passes ⇒ pas de flag, même à score faible", async () => {
    const predict = await createNerPredict({
      pipeline: scoredPipeline({ Sabourdin: 0.7, SABOURDIN: 0.7 }),
    });
    const found = await detectLocalNer("SABOURDIN REBOUR SARL", predict, { extendNames: false });
    expect(found).toEqual([{ value: "SABOURDIN", category: "NAME" }]);
  });

  it("désaccord mais score ≥ 0,99 ⇒ pas de flag (le déclencheur exige LES DEUX)", async () => {
    const predict = await createNerPredict({ pipeline: scoredPipeline({ Sabourdin: 0.995 }) });
    const found = await detectLocalNer("SABOURDIN REBOUR SARL", predict, { extendNames: false });
    expect(found).toEqual([{ value: "SABOURDIN", category: "NAME" }]);
  });

  it("texte à une seule passe ⇒ jamais de flag (l'absence de 2e lecture n'est pas un doute)", async () => {
    // Normal-case prose (≥3% uppercase outside sentence starts): no recase.
    const pipe = vi.fn(scoredPipeline({ "Bernard Velinet": 0.6 }));
    const predict = await createNerPredict({ pipeline: pipe });
    const found = await detectLocalNer("Merci de contacter Bernard Velinet rapidement", predict, {
      extendNames: false,
    });
    expect(pipe).toHaveBeenCalledTimes(1);
    expect(found).toEqual([{ value: "Bernard Velinet", category: "NAME" }]);
  });
});

describe("detectLocalNer — un span ORG qui avale la préposition rend « de » à la phrase", () => {
  it("« de Karl Studio » émet « Karl Studio » (identité unique, grammaire intacte)", async () => {
    // Log 01/08: the NER span « de Karl Studio » became the vault value —
    // the wire read « les résultats oslen Partners? » and the org gained a second
    // identity, distinct from the fake already in the vault for « Karl Studio ».
    const input = "Quels sont les résultats de Karl Studio?";
    const start = input.indexOf("de Karl Studio");
    const predict = () => [
      { start, end: start + "de Karl Studio".length, label: "ORG", score: 0.99 },
    ];
    const found = await detectLocalNer(input, predict, { extendNames: false });
    expect(found).toEqual([{ value: "Karl Studio", category: "ORG" }]);
  });

  it("une PERSONNE garde sa particule (« de Gaulle » n'est pas tronqué)", async () => {
    const input = "le général de Gaulle a répondu";
    const start = input.indexOf("de Gaulle");
    const predict = () => [
      { start, end: start + "de Gaulle".length, label: "PER", score: 0.99 },
    ];
    const found = await detectLocalNer(input, predict, { extendNames: false });
    expect(found).toEqual([{ value: "de Gaulle", category: "NAME" }]);
  });
});
