import { describe, expect, it } from "vitest";
import {
  NEW_CARD_ENTITY,
  freshCardIds,
  makeMemoryCard,
  matchingCardIds,
  memoryNoteTitle,
  mentions,
  newCardEntity,
  normalizeMem,
} from "./memory";
import { formatMemoryBlock } from "./select";
import { searchMemoryStore } from "./search";
import type { MemoryCard, MemoryData } from "../types";

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

describe("bounds + normalization", () => {
  it("clamps facts; refuses an empty entity", () => {
    expect(makeMemoryCard({ entity: "  ", facts: "x" })).toBeNull();
    expect(card({ entity: "X", facts: "y".repeat(5000) }).facts.length).toBeLessThanOrEqual(600);
  });
  it("normalizeMem folds case, accents and separators", () => {
    expect(normalizeMem("Évreux-Ville")).toBe("evreux ville");
  });
  it("a sentence PERIOD is a separator, an EMAIL dot is not (the « Karl Studio. » miss)", () => {
    expect(normalizeMem("chez Karl Studio.")).toBe("chez karl studio");
    expect(normalizeMem("écris à augustin.vaudel@karl-studio.fr.")).toBe("ecris a augustin.vaudel@karl studio.fr");
    const c = card({ entity: "Karl Studio", facts: "x", cat: "organisation" });
    expect(mentions(normalizeMem("le devis de Karl Studio."), c)).toBe(true);
  });
  it("mentions() matches whole keys only", () => {
    const c = card({ entity: "Karl Studio", facts: "x", cat: "organisation" });
    expect(mentions(normalizeMem("chez karl-studio hier"), c)).toBe(true);
    expect(mentions(normalizeMem("le karlstudioblog"), c)).toBe(false);
  });
  it("formatMemoryBlock is empty for an empty selection", () => {
    expect(formatMemoryBlock(undefined, [])).toBe("");
  });
  it("chaque carte injectée porte sa date — une carte sans date se lit comme éternellement vraie", () => {
    const c = card({ entity: "Karl Studio", facts: "Devis signé.", cat: "organisation" });
    const block = formatMemoryBlock(undefined, [c]);
    expect(block).toContain(`(noté le ${new Date(c.updatedAt).toLocaleDateString("fr-FR")})`);
    expect(searchMemoryStore({ cards: [c] }, "devis Karl")).toContain("(noté le ");
  });
  it("freshCardIds — la boîte de réception : l'auto récent, et la fiche manuelle que la machine a mise à jour", () => {
    const now = 1_000_000_000_000;
    const WEEK = 7 * 24 * 3600 * 1000;
    const autoRecent = { ...card({ entity: "Client Auto", facts: "x", cat: "personne" }), source: "auto" as const, updatedAt: now - 1000 };
    const autoOld = { ...card({ entity: "Vieux Auto", facts: "x", cat: "personne" }), source: "auto" as const, updatedAt: now - WEEK - 1 };
    const manualUpdated = { ...card({ entity: "Manuelle", facts: "x", cat: "personne" }), updatedAt: now - 1000, factsLog: [{ at: now - 500, prev: "Ancien fait." }] };
    const manualPlain = { ...card({ entity: "Tranquille", facts: "x", cat: "personne" }), updatedAt: now - 1000 };
    const ids = freshCardIds({ cards: [autoRecent, autoOld, manualUpdated, manualPlain] }, now);
    expect(ids).toEqual(new Set([autoRecent.id, manualUpdated.id]));
  });

  it("freshCardIds — TRAITER vide la boîte : une fiche revue sort, une retouche machine ultérieure la ré-enrôle", () => {
    const now = 1_000_000_000_000;
    const base = { ...card({ entity: "Client Auto", facts: "x", cat: "personne" }), source: "auto" as const, updatedAt: now - 1000 };
    // Revue (Confirmer / édition depuis le panneau) — reviewedAt ≥ updatedAt ⇒ sortie.
    const reviewed = { ...base, reviewedAt: now - 1000 };
    expect(freshCardIds({ cards: [reviewed] }, now).size).toBe(0);
    // La machine repasse APRÈS la revue ⇒ la fiche revient dans la boîte.
    const touchedAgain = { ...base, reviewedAt: now - 2000, updatedAt: now - 100 };
    expect(freshCardIds({ cards: [touchedAgain] }, now)).toEqual(new Set([base.id]));
  });

  it("matchingCardIds filtre entité, alias ET faits — accents pliés, null sans requête", () => {
    const m = mem();
    expect(matchingCardIds(m, "")).toBeNull();
    expect(matchingCardIds(m, "  ")).toBeNull();
    const byEntity = matchingCardIds(m, "karl")!;
    expect(byEntity.size).toBe(2); // la carte Karl Studio + l'alias e-mail d'Augustin
    const byFacts = matchingCardIds(m, "EVREUX")!; // accent plié, casse ignorée
    expect(byFacts.size).toBe(1);
    expect(matchingCardIds(m, "introuvable-zzz")!.size).toBe(0);
  });

  it("memoryNoteTitle keeps a few words, ellipsized — never the whole selection", () => {
    expect(memoryNoteTitle("Toujours relancer les prospects sous 48h, jamais le lundi matin")).toBe(
      "Toujours relancer les prospects sous…",
    );
    expect(memoryNoteTitle("Réponses courtes")).toBe("Réponses courtes"); // short → verbatim, no ellipsis
    expect(memoryNoteTitle("  espaces\n multiples  ici ")).toBe("espaces multiples ici");
    expect(memoryNoteTitle("a".repeat(200)).length).toBeLessThanOrEqual(61); // 60 + ellipsis
  });
});

describe("newCardEntity", () => {
  it("numérote tant que la clé est prise — jamais deux fiches vierges de MÊME clé", () => {
    const cards: MemoryCard[] = [];
    for (let i = 0; i < 3; i++) {
      const name = newCardEntity(cards);
      expect(cards.some((c) => normalizeMem(c.entity) === normalizeMem(name))).toBe(false);
      cards.push(card({ entity: name, facts: "", cat: "personne" }));
    }
    expect(cards.map((c) => c.entity)).toEqual([NEW_CARD_ENTITY, `${NEW_CARD_ENTITY} 2`, `${NEW_CARD_ENTITY} 3`]);
  });

  it("un ALIAS occupe la clé aussi", () => {
    const taken = card({ entity: "Marc", facts: "x", cat: "personne", aliases: [NEW_CARD_ENTITY] });
    expect(newCardEntity([taken])).toBe(`${NEW_CARD_ENTITY} 2`);
  });
});
