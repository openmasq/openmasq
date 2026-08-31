import { describe, it, expect } from "vitest";
import { detectHonorificNames } from "./honorifics";

const values = (text: string): string[] => detectHonorificNames(text).map((d) => d.value);

describe("detectHonorificNames — recall", () => {
  it("catches a lowercase name after a FR bare title (punctuation-less transcript)", () => {
    expect(values("j'ai eu madame keller au téléphone elle confirme")).toEqual(["keller"]);
  });

  it("catches EN bare titles", () => {
    expect(values("please ask mr welby and mrs blackwood")).toEqual(["welby", "blackwood"]);
  });

  it("appends the second token only when it is Capitalized in the original", () => {
    expect(values("Monsieur André Quinsat est arrivé")).toEqual(["André Quinsat"]);
    // lowercase second word = prose, never swallowed ("keller demain" would over-redact)
    expect(values("je vois madame keller demain matin")).toEqual(["keller"]);
  });

  it("requires the dot on ambiguous abbreviations", () => {
    expect(values("m. rebour a signé")).toEqual(["rebour"]);
    expect(values("le m rebour")).toEqual([]); // bare "m" is a letter, not a title
    expect(values("la pr review est prête")).toEqual([]); // "pr" needs its dot
  });

  it("de/es/it titles fire only on a Capitalized name (their bare word is a common noun)", () => {
    expect(values("Gestern habe ich Frau Ostermann getroffen")).toEqual(["Ostermann"]);
    expect(values("la señora García est arrivée")).toEqual(["García"]);
    expect(values("una señora mayor dijo bonjour")).toEqual([]); // lowercase → prose
  });

  it("keeps the title itself out of the value", () => {
    const d = detectHonorificNames("dossier suivi par madame keller");
    expect(d).toEqual([{ value: "keller", category: "NAME", start: 25 }]);
  });
});

describe("detectHonorificNames — l'honorifique COLLÉ par l'OCR", () => {
  // Real leak (walkthrough 14/08, real scanned lease): « MonsieurMaxime OZERAY » and
  // « MonsieurThomas CORBŒLET » — the OCR glues the title to the first name, the separator
  // required 1-2 spaces, and the whole identity was going out IN CLEAR while the
  // properly spaced names in the same deed were masked.
  it("détecte le nom quand l'OCR a collé le titre au prénom — la valeur INCLUT le titre soudé", () => {
    // The emitted value is « MonsieurRomain SORBON » WHOLE, not « Romain SORBON »:
    // the vault never rewrites a fragment inside a word (isWordGlued), so a
    // value without the title would be detected but never replaced — the exact leak
    // this closes, backed by a passing detection.
    const d = detectHonorificNames("Est présent MonsieurRomain SORBON, colocataire entrant.");
    expect(d.map((x) => x.value)).toContain("MonsieurRomain SORBON");
  });

  it("colle + nom TOUT EN CAPITALES (carte d'identité, acte)", () => {
    const d = detectHonorificNames("Signé : MmeVIDALENC, bailleresse.");
    expect(d.map((x) => x.value)).toContain("MmeVIDALENC");
  });

  it("la colle n'existe qu'à la frontière minuscule→MAJUSCULE — jamais dans un mot ordinaire", () => {
    // « FRAUEN » contains « FRAU » but the U→E boundary is Lu→Lu; « monsieurthomas »
    // has no uppercase letter after the glue point. Neither should produce a name.
    expect(detectHonorificNames("DIE FRAUEN VERSAMMLUNG beginnt.")).toEqual([]);
    expect(detectHonorificNames("le monsieurthomas du quartier")).toEqual([]);
  });
});

describe("detectHonorificNames — precision", () => {
  it("never fires on a stopword/role after the title", () => {
    expect(values("madame la présidente a voté")).toEqual([]);
    expect(values("monsieur le maire est venu")).toEqual([]);
    expect(values("mr president spoke first")).toEqual([]);
  });

  it("never fires on a French inversion ('monsieur veut-il')", () => {
    expect(values("monsieur veut-il un café")).toEqual([]);
    expect(values("madame a-t-elle rappelé")).toEqual([]);
  });

  it("never fires on German COMMON-NOUN frau/herr (article before)", () => {
    expect(values("die frau Kam herein")).toEqual([]);
    expect(values("eine junge frau Wartete")).toEqual([]);
  });

  it("never fires on a generic/country word", () => {
    expect(values("madame facture demain")).toEqual([]); // generic doc word
    expect(values("monsieur france ce soir")).toEqual([]); // country
  });
});

describe("detectHonorificNames — couples, maiden and marriage names", () => {
  it("'M. et Mme X' — the rejected 'et' must not swallow the next title", () => {
    const v = detectHonorificNames("M. et Mme SABOURDIN-SAVEL, propriétaires").map((d) => d.value);
    expect(v).toContain("SABOURDIN-SAVEL");
  });
  it("née / épouse anchor the maiden/marriage SURNAME (Capitalized only)", () => {
    expect(detectHonorificNames("Mme MORVAN Jacqueline née BERTIN, demeurant…").map((d) => d.value))
      .toEqual(expect.arrayContaining(["MORVAN Jacqueline", "BERTIN"]));
    expect(detectHonorificNames("SAVARY Sylvie épouse VERCHÈRE").map((d) => d.value))
      .toContain("VERCHÈRE");
  });
  it("'née le <date>' / 'né en Bretagne' never yield a name (dates are birthDates.ts')", () => {
    expect(detectHonorificNames("Née le 17 mars 1993 à Niort")).toEqual([]);
    expect(detectHonorificNames("un projet né en Bretagne")).toEqual([]);
  });
});

describe("detectHonorificNames — les titres académiques se CUMULENT", () => {
  const values = (t: string) => detectHonorificNames(t).map((d) => d.value);

  /** ⚠️ REGRESSION measured by `bench/sourceFp.bench.ts`: the discipline mention was
   *  the FIRST token of the match, so the detector emitted « med » and stopped there — the
   *  practitioner's name, two tokens further, was never proposed. A false positive that
   *  WAS HIDING a miss: both halves are checked here. */
  it("« Dr. med. » est un TITRE, pas un nom — et le vrai nom est retrouvé", () => {
    const v = values("Mit kollegialen Grüßen Dr. med. Hendrik WALDHOFF-ARNDT, Oberarzt");
    expect(v).toEqual(["Hendrik WALDHOFF-ARNDT"]);
    expect(v).not.toContain("med");
  });

  it("les continuations s'enchaînent, y compris soudées par un trait d'union", () => {
    expect(values("Dr. rer. nat. Ulrike STEGER leitet das Labor")).toEqual(["Ulrike STEGER"]);
    expect(values("Dr.-Ing. Klaus WULFF")).toEqual(["Klaus WULFF"]);
  });

  /** A title refused as a NAME must hand back control ON it, not after: otherwise the stack
   *  « Prof. Dr. med. habil. » consumed the only anchor point and the name was lost. */
  it("une PILE de titres reste un titre", () => {
    expect(values("Prof. Dr. med. habil. Sabine BRENNEKE")).toEqual(["Sabine BRENNEKE"]);
  });

  /** The dot is required, exactly like for abbreviated titles: without it, « Med » or
   *  « Ing » is an ordinary capitalized word — and swallowing it would eat a real surname. */
  it("sans le point, la continuation n'en est pas une", () => {
    expect(values("Dr Med SAVEL")).toContain("Med SAVEL");
  });
});
