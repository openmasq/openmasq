import { describe, it, expect } from "vitest";
import { contentWords, mergeFacts, mergeFactsDetailed, restoreFact, restates } from "./compaction";
import { mergeExtraction } from "./extract";
import { makeMemoryCard } from "./memory";
import type { MemoryCard } from "../types";

describe("une fiche COMPACTE — elle ne se redit pas", () => {
  it("remplace une reformulation par la version la plus riche", () => {
    // The measured case: two extraction passes, the same statement twice.
    const out = mergeFacts("PDG de Walmart depuis janvier 2026", "Est PDG de Walmart depuis janvier 2026");
    expect(out).toBe("Est PDG de Walmart depuis janvier 2026");
    expect(out.match(/Walmart/g)).toHaveLength(1);
  });

  it("compacte « selon la mise à jour » / « selon la mise à jour officielle »", () => {
    const a = "membre du gouvernement français selon la mise à jour du 26 février 2026";
    const b = "membre du gouvernement français selon la mise à jour officielle du 26 février 2026";
    expect(mergeFacts(a, b)).toBe(b);
  });

  it("ne fusionne PAS deux dates différentes — c'est une information, pas un doublon", () => {
    const a = "membre du gouvernement français (au 26 juillet 2026)";
    const b = "membre du gouvernement français selon la mise à jour du 26 février 2026";
    expect(restates(a, b)).toBe(false);
    expect(mergeFacts(a, b)).toContain("juillet");
    expect(mergeFacts(a, b)).toContain("février");
  });

  it("garde deux faits réellement distincts", () => {
    const out = mergeFacts("Responsable du design.", "Basée à Lyon.");
    expect(out).toBe("Responsable du design. Basée à Lyon.");
  });

  it("n'écrase que la phrase concernée, pas les voisines", () => {
    const out = mergeFacts(
      "Cliente principale. PDG de Walmart depuis janvier 2026. Aime le café.",
      "Est PDG de Walmart depuis janvier 2026",
    );
    expect(out).toContain("Cliente principale.");
    expect(out).toContain("Aime le café.");
    expect(out.match(/Walmart/g)).toHaveLength(1);
  });

  it("les mots-outils ne distinguent jamais deux affirmations", () => {
    expect([...contentWords("Est le PDG de Walmart")]).toEqual(["pdg", "walmart"]);
    expect(restates("Est le PDG de Walmart", "PDG Walmart")).toBe(true);
  });

  it("un fait vide ou une carte vide se comportent comme avant", () => {
    expect(mergeFacts("", "Un fait.")).toBe("Un fait.");
    expect(restates("", "Un fait.")).toBe(false);
  });

  // The REPORTED case (13/08): the same « retiens que » instruction replayed, the
  // extractor rephrasing on each pass — four variants one word apart on a single card.
  it("les reformulations à un mot d'écart se replient — le cas Atelier Lucane", () => {
    const variants = [
      "Atelier Lucane est associé à Camille Salvi dans le cadre du projet Horizon.",
      "Atelier Lucane est associé à Camille Salvi comme cliente du projet Horizon.",
      "Atelier Lucane est l'organisation associée à la cliente Camille Salvi.",
      "Atelier Lucane est la cliente associée à Camille Salvi pour le projet Horizon.",
    ];
    let facts = variants[0]!;
    for (const v of variants.slice(1)) facts = mergeFacts(facts, v);
    // ONE single statement survives — not four wrappings of the same one.
    expect(facts.match(/Camille Salvi/g)).toHaveLength(1);
    expect(facts.match(/Atelier Lucane/g)).toHaveLength(1);
  });

  it("tolère les flexions : « associé » / « associée » sont le même mot", () => {
    expect(
      restates(
        "Atelier Lucane est associé à Camille Salvi pour le projet Horizon.",
        "Atelier Lucane est la structure associée à Camille Salvi pour le projet Horizon.",
      ),
    ).toBe(true);
  });

  it("ne replie PAS deux faits qui ne partagent qu'un ou deux mots", () => {
    // « Aime le café » / « Aime le thé »: one word apart each, but a single shared
    // word — two tastes, not a rephrasing.
    expect(restates("Aime le café.", "Aime le thé.")).toBe(false);
    expect(mergeFacts("Aime le café.", "Aime le thé.")).toContain("café");
  });

  it("un mois qui change n'est jamais une reformulation, même à un mot d'écart", () => {
    expect(
      restates(
        "Livraison du lot Horizon prévue en juillet avec Camille Salvi.",
        "Livraison du lot Horizon prévue en septembre avec Camille Salvi.",
      ),
    ).toBe(false);
  });
});

describe("l'historique de compaction — la preuve n'est jamais écrasée en silence", () => {
  it("une mise à jour d'ATTRIBUT consigne la phrase remplacée", () => {
    const out = mergeFactsDetailed("Cliente fidèle. Deadline fin septembre.", "Deadline le 15 novembre.");
    expect(out.facts).toBe("Cliente fidèle. Deadline le 15 novembre.");
    expect(out.replaced).toEqual(["Deadline fin septembre."]);
  });

  it("une REFORMULATION ne consigne rien — l'affirmation est la même, rien n'est perdu", () => {
    const out = mergeFactsDetailed("PDG de Walmart depuis janvier 2026", "Est PDG de Walmart depuis janvier 2026");
    expect(out.replaced).toEqual([]);
  });

  it("la saturation évince des phrases ENTIÈRES, les plus anciennes d'abord — jamais un slice en pleine phrase", () => {
    const old1 = "Premier fait ancien sur le client.";
    const old2 = "Deuxième fait un peu plus récent.";
    const nouveau = `Le fait tout neuf: ${"détail ".repeat(75)}est arrivé.`;
    const out = mergeFactsDetailed(`${old1} ${old2}`, nouveau);
    expect(out.replaced).toContain(old1); // the oldest goes first
    expect(out.facts).toContain("est arrivé."); // the NEW fact is never evicted nor cut…
    expect(out.facts.length).toBeLessThanOrEqual(600);
    expect(out.facts.startsWith("Deuxième") || out.facts.startsWith("Le fait tout neuf")).toBe(true);
  });

  it("restoreFact est symétrique : l'ancienne valeur revient, l'actuelle passe dans l'historique", () => {
    const card: MemoryCard = {
      ...makeMemoryCard({ entity: "Karl Studio", facts: "Deadline le 15 novembre.", cat: "organisation" })!,
      factsLog: [{ at: 1, prev: "Deadline fin septembre." }],
    };
    const r = restoreFact(card, 0)!;
    expect(r.facts).toBe("Deadline fin septembre.");
    expect(r.factsLog).toEqual([expect.objectContaining({ prev: "Deadline le 15 novembre." })]);
    // …and is restored in turn (the redo).
    const back = restoreFact({ ...card, ...r }, 0)!;
    expect(back.facts).toBe("Deadline le 15 novembre.");
  });

  it("mergeExtraction pose l'historique sur la carte mise à jour — et la NOMME dans updatedIds", () => {
    const card = makeMemoryCard({ entity: "Projet Merlebleu", facts: "Deadline septembre.", cat: "projet" })!;
    const { data, createdIds, updatedIds } = mergeExtraction(
      { cards: [card] },
      { facts: [{ entity: "Projet Merlebleu", fact: "Deadline le 3 décembre.", cat: "projet" }] },
      1234,
    );
    expect(data.cards[0].facts).toBe("Deadline le 3 décembre.");
    expect(data.cards[0].factsLog).toEqual([{ at: 1234, prev: "Deadline septembre." }]);
    expect(createdIds).toEqual([]);
    expect(updatedIds).toEqual([card.id]); // the chat's caption makes the update visible
  });
});
