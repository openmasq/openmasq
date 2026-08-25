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
  // Fuite vécue (parcours 14/08, bail scanné réel) : « MonsieurMaxime OZERAY » et
  // « MonsieurThomas CORBŒLET » — l'OCR colle le titre au prénom, le séparateur
  // exigeait 1-2 espaces, et l'identité entière partait EN CLAIR pendant que les
  // noms bien espacés du même acte étaient masqués.
  it("détecte le nom quand l'OCR a collé le titre au prénom — la valeur INCLUT le titre soudé", () => {
    // La valeur émise est « MonsieurRomain SORBON » ENTIER, pas « Romain SORBON » :
    // le vault ne réécrit jamais un fragment dans un mot (isWordGlued), donc une
    // valeur sans le titre serait détectée mais jamais remplacée — la fuite exacte
    // qu'on ferme, avec une détection verte à l'appui.
    const d = detectHonorificNames("Est présent MonsieurRomain SORBON, colocataire entrant.");
    expect(d.map((x) => x.value)).toContain("MonsieurRomain SORBON");
  });

  it("colle + nom TOUT EN CAPITALES (carte d'identité, acte)", () => {
    const d = detectHonorificNames("Signé : MmeVIDALENC, bailleresse.");
    expect(d.map((x) => x.value)).toContain("MmeVIDALENC");
  });

  it("la colle n'existe qu'à la frontière minuscule→MAJUSCULE — jamais dans un mot ordinaire", () => {
    // « FRAUEN » contient « FRAU » mais la frontière U→E est Lu→Lu ; « monsieurthomas »
    // n'a pas de majuscule après la colle. Ni l'un ni l'autre ne doit produire un nom.
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

  /** ⚠️ RÉGRESSION mesurée par `bench/sourceFp.bench.ts` : la mention de discipline était
   *  le PREMIER jeton du match, donc le détecteur émettait « med » et s'arrêtait là — le
   *  nom du praticien, deux jetons plus loin, n'était jamais proposé. Un faux positif qui
   *  CACHAIT un manque : les deux moitiés sont vérifiées ici. */
  it("« Dr. med. » est un TITRE, pas un nom — et le vrai nom est retrouvé", () => {
    const v = values("Mit kollegialen Grüßen Dr. med. Hendrik WALDHOFF-ARNDT, Oberarzt");
    expect(v).toEqual(["Hendrik WALDHOFF-ARNDT"]);
    expect(v).not.toContain("med");
  });

  it("les continuations s'enchaînent, y compris soudées par un trait d'union", () => {
    expect(values("Dr. rer. nat. Ulrike STEGER leitet das Labor")).toEqual(["Ulrike STEGER"]);
    expect(values("Dr.-Ing. Klaus WULFF")).toEqual(["Klaus WULFF"]);
  });

  /** Un titre refusé comme NOM doit rendre la main SUR lui, pas après : sinon la pile
   *  « Prof. Dr. med. habil. » consommait le seul point d'ancrage et le nom était perdu. */
  it("une PILE de titres reste un titre", () => {
    expect(values("Prof. Dr. med. habil. Sabine BRENNEKE")).toEqual(["Sabine BRENNEKE"]);
  });

  /** Le point est requis, exactement comme pour les titres abrégés : sans lui, « Med » ou
   *  « Ing » est un mot capitalisé ordinaire — et l'avaler mangerait un vrai patronyme. */
  it("sans le point, la continuation n'en est pas une", () => {
    expect(values("Dr Med SAVEL")).toContain("Med SAVEL");
  });
});
