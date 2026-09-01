import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { docSummary, previewStatus } from "./docSummary";

const fr = getMessages("fr");

describe("docSummary — the subtitle states what IS, not what will be", () => {
  it("counts DISTINCT values and names their categories, richest first", () => {
    const s = docSummary([
      { real: "Julien Sabourdin", kind: "name" },
      { real: "Claire Fontaine", kind: "name" },
      { real: "a@b.fr", kind: "email" },
      { real: "12 rue de Verdun", kind: "address" },
    ], fr);
    expect(s.label).toBe("4 valeurs protégées");
    expect(s.detail).toBe("2 × Noms & prénoms · 1 × Adresse postale · 1 × E-mail");
  });

  it("counts a repeated value once", () => {
    const s = docSummary([
      { real: "a@b.fr", kind: "email" },
      { real: "a@b.fr", kind: "email" },
    ], fr);
    expect(s.label).toBe("1 valeur protégée");
    expect(s.detail).toBe("1 × E-mail");
  });

  it("says plainly when nothing was detected", () => {
    for (const empty of [undefined, [], [{ real: "", kind: "name" }]]) {
      const s = docSummary(empty, fr);
      expect(s.label).toBe("aucune valeur détectée");
      expect(s.detail).toBe("");
    }
  });

  it("never shows an engine key for an unknown kind", () => {
    const s = docSummary([{ real: "x", kind: "not_a_kind" }], fr);
    expect(s.detail).toBe("1 × élément");
  });
});

describe("previewStatus — « aucune valeur détectée » n'est jamais qu'une PREUVE (audit 2026-08-10)", () => {
  it("une passe EN COURS le dit (avec sa progression), au lieu de « rien détecté »", () => {
    const s = previewStatus({ redacting: true, redactProgress: { done: 3, total: 8 }, replacements: undefined }, fr);
    expect(s.label).toBe("redaction en cours… (3/8)");
    expect(s.pending).toBe(true);
    // Single chunk: no "(1/1)" counter that says nothing.
    expect(previewStatus({ redacting: true, redactProgress: { done: 0, total: 1 }, replacements: undefined }, fr).label)
      .toBe("redaction en cours…");
  });

  it("une passe ÉCHOUÉE le dit — le mensonge rassurant est l'exact bug d'origine", () => {
    const s = previewStatus({ redactError: "détection locale échouée", replacements: undefined }, fr);
    expect(s.label).toBe("échec du redaction");
    expect(s.failed).toBe(true);
    expect(s.detail).toBe("détection locale échouée");
  });

  it("un redaction jamais THREADÉ ici ne prétend pas « rien détecté »", () => {
    const s = previewStatus({ replacements: undefined }, fr);
    expect(s.label).toBe("redaction non vérifié ici");
    expect(s.pending).toBe(true);
  });

  it("le compte PROUVÉ (tableau présent) redonne la ligne de docSummary", () => {
    expect(previewStatus({ replacements: [] }, fr).label).toBe("aucune valeur détectée");
    expect(previewStatus({ replacements: [{ real: "a@b.fr", kind: "email" }] }, fr).label).toBe("1 valeur protégée");
  });

  it("« en cours » l'emporte sur un échec PRÉCÉDENT — un re-run efface l'alerte le temps de tourner", () => {
    const s = previewStatus({ redacting: true, redactError: "vieille erreur", replacements: undefined }, fr);
    expect(s.pending).toBe(true);
    expect(s.failed).toBeUndefined();
  });
});
