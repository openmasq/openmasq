import { describe, expect, it } from "vitest";
import { makeMemoryCard } from "./memory";
import { searchMemoryHybrid, searchMemoryStore } from "./search";
import type { MemoryData } from "../types";

const card = (over: Partial<Parameters<typeof makeMemoryCard>[0]> & { entity: string; facts: string }) =>
  makeMemoryCard({ ...over })!;

function mem(): MemoryData {
  return {
    profile: "Consultant indépendant, clients PME françaises, répond en français.",
    cards: [
      card({ entity: "Augustin Vaudel", facts: "Client principal, préfère les points le jeudi.", cat: "personne", aliases: ["Vaudel", "augustin.vaudel@karl-studio.fr"] }),
      card({ entity: "Karl Studio", facts: "Agence de design à Évreux, devis Q3 signé (18 000 €).", cat: "organisation" }),
      card({ entity: "Projet Merlebleu", facts: "Refonte du site, deadline septembre.", cat: "projet" }),
    ],
  };
}

describe("memory_search hybride — le sémantique complète le lexical, jamais l'inverse", () => {
  const m = (): MemoryData => ({
    cards: [
      card({ entity: "Karl Studio", facts: "Agence de design audio à Évreux.", cat: "organisation" }),
      card({ entity: "Augustin Vaudel", facts: "Client principal.", cat: "personne" }),
    ],
  });

  it("la question qui DÉCRIT sans nommer passe par l'index ; plancher tenu", async () => {
    const mem = m();
    const ids = mem.cards.map((c) => c.id);
    const semantic = async () => [
      { id: ids[0], sim: 0.93 }, // au-dessus du plancher → complète
      { id: ids[1], sim: 0.85 }, // base e5 entre textes sans rapport → refusé
    ];
    // AUCUN mot de la requête n'apparaît dans les fiches : le lexical rend zéro,
    // seul l'index peut répondre — c'est exactement le trou qu'il comble.
    const out = await searchMemoryHybrid(mem, "le prestataire du secteur sonore", semantic);
    expect(out).toContain("Karl Studio");
    expect(out).not.toContain("Augustin Vaudel");
  });

  it("sans index, ou sur son erreur : le lexical seul, comme avant", async () => {
    const mem = m();
    expect(await searchMemoryHybrid(mem, "Karl Studio", undefined)).toContain("Karl Studio");
    const boom = async () => {
      throw new Error("index down");
    };
    expect(await searchMemoryHybrid(mem, "Karl Studio", boom)).toContain("Karl Studio");
  });

  it("un hit lexical n'est jamais doublé par son écho sémantique", async () => {
    const mem = m();
    const semantic = async () => [{ id: mem.cards[0].id, sim: 0.97 }];
    const out = await searchMemoryHybrid(mem, "devis Karl Studio", semantic);
    expect(out.match(/Karl Studio \(organisation\)/g)).toHaveLength(1);
  });
});

describe("memory_search (the model-pulled path)", () => {
  it("matches on entity, alias and FACTS words; compact bounded output", () => {
    const out = searchMemoryStore(mem(), "deadline du projet de refonte");
    expect(out).toContain("Projet Merlebleu");
    expect(out.split("\n").length).toBeLessThanOrEqual(4);
  });
  it("empty on no hit / empty store", () => {
    expect(searchMemoryStore(mem(), "zzz introuvable")).toBe("");
    expect(searchMemoryStore({ cards: [] }, "Augustin")).toBe("");
  });
  it("a STOPWORD-only overlap is no hit (« les plans pour le weekend » matches nothing)", () => {
    const m: MemoryData = {
      cards: [card({ entity: "Augustin Vaudel", facts: "Valide les points le jeudi.", cat: "personne" })],
    };
    expect(searchMemoryStore(m, "les plans pour le weekend")).toBe("");
  });
});
