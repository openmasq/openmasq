import { describe, expect, it } from "vitest";
import { findExistingSkill, parseProposedSkill, isCompleteSkill } from "./proposedSkill";

/**
 * The block arrives AS A STREAM and comes from a model: the two facts that govern these cases.
 * So we read what's there without ever throwing, we only allow adding on a
 * complete block, and we only let into the app's data what the CATALOGUE
 * recognizes — an id invented by the model has no business in `servers`.
 */

const COMP = `# Compte rendu d'entretien
catégorie: redaction
description: Structure un compte rendu à partir de notes brutes.
---
Tu es un assistant qui rédige des comptes rendus d'entretien.
Structure : contexte, points abordés, décisions.`;

describe("parseProposedSkill — le cas nominal", () => {
  it("lit titre, catégorie, description et prompt", () => {
    const s = parseProposedSkill("competence", COMP);
    expect(s.name).toBe("Compte rendu d'entretien");
    expect(s.cat).toBe("redaction");
    expect(s.desc).toBe("Structure un compte rendu à partir de notes brutes.");
    expect(s.prompt.startsWith("Tu es un assistant")).toBe(true);
    expect(s.prompt).toContain("contexte, points abordés");
    expect(isCompleteSkill(s)).toBe(true);
  });

  it("le `kind` vient de la balise, jamais du contenu", () => {
    // The body lies; the closing tag is authoritative — otherwise the model would choose the rail
    // (and thus the framed connectors) by a word written in the middle of the text.
    const s = parseProposedSkill("competence", "# X\n---\nCeci est un workflow Gmail.");
    expect(s.kind).toBe("competence");
    expect(s.servers).toEqual([]);
  });
});

describe("ce que le modèle a le droit d'écrire de travers", () => {
  it("accepte le libellé de catégorie autant que l'id, accents et casse indifférents", () => {
    for (const v of ["redaction", "Rédaction", "RÉDACTION", " rédaction "]) {
      expect(parseProposedSkill("competence", `# X\ncatégorie: ${v}\n---\nP`).cat).toBe("redaction");
    }
  });

  it("écarte une catégorie qui n'existe pas plutôt que de l'inventer", () => {
    expect(parseProposedSkill("competence", "# X\ncatégorie: cuisine\n---\nP").cat).toBeUndefined();
  });

  it("accepte les étiquettes en anglais", () => {
    const s = parseProposedSkill("competence", "# X\ndescription: Hello\ncategory: code\n---\nP");
    expect(s.desc).toBe("Hello");
    expect(s.cat).toBe("code");
  });

  it("se passe du séparateur `---` — la première ligne non-étiquette ferme l'en-tête", () => {
    const s = parseProposedSkill("competence", "# X\ndescription: D\nTu es un assistant.");
    expect(s.desc).toBe("D");
    expect(s.prompt).toBe("Tu es un assistant.");
  });

  it("garde une clé inconnue DANS le prompt au lieu de la perdre", () => {
    const s = parseProposedSkill("competence", "# X\nton: formel\n---\nP");
    expect(s.prompt).toContain("ton: formel");
  });
});

describe("workflow — les connecteurs passent par le catalogue", () => {
  it("résout les ids connus et écarte les inventés", () => {
    const s = parseProposedSkill("workflow", "# Tri\nconnecteurs: gmail, licorne, slack\n---\nP");
    expect(s.servers).toEqual(["gmail", "slack"]);
  });

  it("ne duplique pas et tolère le point-virgule", () => {
    expect(parseProposedSkill("workflow", "# T\nconnecteurs: gmail; gmail\n---\nP").servers).toEqual([
      "gmail",
    ]);
  });
});

describe("le bloc EN COURS d'écriture ne casse rien et n'ajoute rien", () => {
  const partiels = [
    ["vide", ""],
    ["titre seul", "# Compte rendu"],
    ["titre + étiquette", "# Compte rendu\ncatégorie: redaction"],
    ["en-tête fermé, prompt pas commencé", "# Compte rendu\ndescription: D\n---\n"],
    ["pas de titre", "description: D\n---\nP"],
  ];
  for (const [libelle, texte] of partiels) {
    it(`${libelle} : se lit, mais n'autorise pas l'ajout`, () => {
      const s = parseProposedSkill("competence", texte);
      expect(isCompleteSkill(s)).toBe(false);
    });
  }

  it("un titre sans prompt n'est PAS complet (l'entrée serait vide)", () => {
    expect(isCompleteSkill(parseProposedSkill("competence", "# X\n---\n   "))).toBe(false);
  });
});

describe("findExistingSkill — l'identité d'une adoption (anti-doublon, signalé 13/08)", () => {
  const list = [
    { id: "c1", name: "Fiche produit Canva juridique", prompt: "Génère une fiche produit.\n" },
    { id: "c2", name: "Autre", prompt: "x" },
  ];
  it("retrouve une entrée identique à espaces près (nom + prompt)", () => {
    expect(findExistingSkill(list, { name: " Fiche produit Canva juridique ", prompt: "Génère une fiche produit." })?.id).toBe("c1");
  });
  it("un prompt différent n'est PAS la même compétence — un vrai homonyme reste créable", () => {
    expect(findExistingSkill(list, { name: "Fiche produit Canva juridique", prompt: "Autre prompt." })).toBeUndefined();
  });
  it("nom ou prompt vide ne matche jamais (un bloc en cours d'écriture)", () => {
    expect(findExistingSkill(list, { name: "", prompt: "x" })).toBeUndefined();
    expect(findExistingSkill(undefined, { name: "a", prompt: "b" })).toBeUndefined();
  });
});
