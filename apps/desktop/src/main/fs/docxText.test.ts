import { describe, it, expect } from "vitest";
import { applyDocxEdit, docxParagraphs, docxToText } from "./docxText";

/** A body the way Word actually writes one: a sentence SPLIT across runs at a formatting
 *  boundary, an empty paragraph, and an escaped entity. */
const BODY = [
  "<w:body>",
  '<w:p><w:r><w:t xml:space="preserve">Bonjour </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Marie</w:t></w:r></w:p>',
  "<w:p/>",
  "<w:p><w:r><w:t>Total : 1500 &amp; plus</w:t></w:r></w:p>",
  "<w:p><w:r><w:t>Ligne A : commun</w:t></w:r></w:p>",
  "<w:p><w:r><w:t>Ligne B : commun</w:t></w:r></w:p>",
  "</w:body>",
].join("");

describe("lecture", () => {
  it("recolle une phrase coupée en plusieurs runs", () => {
    // THE trap: Word splits at every formatting boundary, so matching run-by-run would
    // never find « Bonjour Marie ».
    expect(docxParagraphs(BODY)[0]).toEqual({ index: 1, text: "Bonjour Marie" });
  });

  it("garde les paragraphes vides — ce sont les lignes blanches du document", () => {
    // Dropping them would renumber every paragraph the model refers to.
    const paras = docxParagraphs(BODY);
    expect(paras).toHaveLength(5);
    expect(paras[1]).toEqual({ index: 2, text: "" });
  });

  it("décode les entités XML", () => {
    expect(docxToText(BODY)).toContain("Total : 1500 & plus");
  });
});

describe("édition — fermée sur toute ambiguïté", () => {
  it("remplace dans le paragraphe concerné et laisse le reste OCTET pour OCTET", () => {
    const { xml, paragraph } = applyDocxEdit(BODY, "Total : 1500 & plus", "Total : 1800 & plus");
    expect(paragraph).toBe(3);
    // Le paragraphe 1 (celui coupé en runs) n'est pas touché : son gras survit.
    expect(xml).toContain('<w:rPr><w:b/></w:rPr>');
    expect(docxParagraphs(xml)[2].text).toBe("Total : 1800 & plus");
  });

  it("ré-échappe ce qu'il écrit", () => {
    const { xml } = applyDocxEdit(BODY, "Total : 1500 & plus", "A < B & C");
    expect(xml).toContain("A &lt; B &amp; C");
    expect(docxParagraphs(xml)[2].text).toBe("A < B & C");
  });

  it("force xml:space=preserve — sinon Word mange les espaces de bord", () => {
    const { xml } = applyDocxEdit(BODY, "Total : 1500 & plus", "Total :  ");
    expect(xml).toMatch(/<w:t[^>]*xml:space="preserve"[^>]*>Total :  <\/w:t>/);
  });

  it("écrit dans le PREMIER run et vide les autres, sans les supprimer", () => {
    // Supprimer un run jetterait les propriétés que Word y attache.
    const { xml } = applyDocxEdit(BODY, "Bonjour Marie", "Salut Marie");
    const para = /<w:p>(?:(?!<\/w:p>)[\s\S])*Salut Marie[\s\S]*?<\/w:p>/.exec(xml)![0];
    expect(para).toContain("Salut Marie");
    expect(para).toContain("<w:t></w:t>"); // le second run, vidé mais présent
    expect(para).toContain("<w:b/>"); // ses propriétés intactes
  });

  it("REFUSE un texte absent", () => {
    expect(() => applyDocxEdit(BODY, "n'existe pas", "x")).toThrow(/introuvable/);
  });

  it("REFUSE un texte présent dans plusieurs paragraphes", () => {
    // « commun » est dans deux lignes. Choisir pour le modèle éditerait au mauvais endroit
    // sans que personne le voie.
    expect(() => applyDocxEdit(BODY, "commun", "x")).toThrow(/2 paragraphes/);
  });

  it("REFUSE un remplacement vide ou identique", () => {
    expect(() => applyDocxEdit(BODY, "", "x")).toThrow(/vide/);
    expect(() => applyDocxEdit(BODY, "Total : 1500 & plus", "Total : 1500 & plus")).toThrow(/identiques/);
  });
});
