import { describe, it, expect } from "vitest";
import { titleCase, needsRecase, recaseLike, variantOccurrences, entityVariantRegex } from "./util";

describe("titleCase", () => {
  it("title-cases plain and ALL-CAPS words", () => {
    expect(titleCase("JEAN MORVAN habite à paris")).toBe("Jean Morvan Habite À Paris");
  });

  it("capitalizes the sub-word after an APOSTROPHE (cased-NER recase pass)", () => {
    // "D'avignon" reads as a common noun to a cased model — the entity was missed.
    expect(titleCase("le local d'avignon")).toBe("Le Local D'Avignon");
    expect(titleCase("l'hôtel du parc")).toBe("L'Hôtel Du Parc");
    expect(titleCase("dell'aquila")).toBe("Dell'Aquila");
  });

  it("capitalizes the sub-word after a HYPHEN", () => {
    expect(titleCase("saint-brieuc")).toBe("Saint-Brieuc");
    expect(titleCase("jean-pierre lavigny")).toBe("Jean-Pierre Lavigny");
    expect(titleCase("CLERMONT-FERRAND")).toBe("Clermont-Ferrand");
  });

  it("keeps a 1-letter tail lower (possessives / contractions)", () => {
    expect(titleCase("john's house")).toBe("John's House");
    expect(titleCase("don't tell sarah")).toBe("Don't Tell Sarah");
  });

  it("keeps VERB elisions lower — 'M'Appelle' confuses the cased model", () => {
    expect(titleCase("je m'appelle claire vaudray")).toBe("Je M'appelle Claire Vaudray");
    expect(titleCase("j'habite ici et c'est bien")).toBe("J'habite Ici Et C'est Bien");
    expect(titleCase("qu'il n'oublie rien")).toBe("Qu'il N'oublie Rien");
  });
});

describe("needsRecase", () => {
  it("triggers on all-lowercase typing", () => {
    expect(needsRecase("je suis augustin vaudel vraiment")).toBe(true);
  });

  it("ignores a sentence-INITIAL capital ('Je suis augustin vaudel')", () => {
    expect(needsRecase("Je suis augustin vaudel")).toBe(true);
  });

  it("ignores line-start and post-punctuation capitals across a paragraph", () => {
    expect(needsRecase("Bonjour.\nJe voulais prévenir que augustin vaudel passera. Merci !")).toBe(true);
  });

  it("does NOT trigger on well-cased prose (mid-sentence capitals are deliberate)", () => {
    expect(needsRecase("Je m'appelle Jean Valjean aujourd'hui")).toBe(false);
  });

  it("triggers on an ALL-CAPS word regardless of the ratio", () => {
    expect(needsRecase("Merci de contacter REBOUR rapidement")).toBe(true);
  });
});

describe("recaseLike — a separator-less real gets a GLUED fake (URL hosts)", () => {
  it("glues and case-matches for lowercase and ALL-CAPS single-token spellings", () => {
    expect(recaseLike("Ashborne Group", "francetravail")).toBe("ashbornegroup");
    expect(recaseLike("Ashborne Group", "FRANCETRAVAIL")).toBe("ASHBORNEGROUP");
  });
  it("a camelCase glued real still recases per-token (existing behaviour)", () => {
    expect(recaseLike("Oslen Group", "KarlStudio")).toBe("OslenGroup");
  });
});

/**
 * ⚠️ Le REPLI de `variantOccurrences` est le seul chemin pour les valeurs que
 * `entityVariantRegex` refuse de fuzzy-matcher : celles portant un CHIFFRE
 * (« ACME2024 », « Projet A7 ») et les mots isolés de moins de 4 lettres (« IBM »).
 * Il était `input.includes(value)`, donc SENSIBLE À LA CASSE — alors que tout le reste
 * du moteur ne l'est pas. C'est la forme d'un nom de projet ou d'un sigle d'entreprise,
 * pas un cas de bord ; et c'est ce repli que consulte l'escalade fail-closed du mode
 * clair du navigateur (`ui/agent/navClearRedact.ts`) pour décider qu'une page contient
 * une valeur du Coffre.
 */
describe("variantOccurrences — insensible à la casse, repli compris", () => {
  it("valeur AVEC CHIFFRE : toutes les casses, avec les caractères RÉELS du texte", () => {
    expect(entityVariantRegex("ACME2024")).toBeNull(); // c'est bien le repli qui joue
    expect(variantOccurrences("Contrat acme2024 puis ACME2024 signés.", "ACME2024")).toEqual([
      "acme2024",
      "ACME2024",
    ]);
  });

  it("sigle de moins de 4 lettres : idem", () => {
    expect(entityVariantRegex("IBM")).toBeNull();
    expect(variantOccurrences("chez ibm hier", "IBM")).toEqual(["ibm"]);
  });

  it("le repli reste borné aux MOTS ENTIERS — « ibm » dans « ibmx » n'est pas la valeur", () => {
    expect(variantOccurrences("le produit ibmx", "IBM")).toEqual([]);
  });

  it("absente du texte ⇒ aucune occurrence", () => {
    expect(variantOccurrences("rien à voir", "ACME2024")).toEqual([]);
  });

  it("le chemin fuzzy (sans chiffre, ≥4 lettres) est inchangé", () => {
    expect(variantOccurrences("chez karl-studio et KARL STUDIO", "Karl Studio")).toEqual([
      "karl-studio",
      "KARL STUDIO",
    ]);
  });
});
