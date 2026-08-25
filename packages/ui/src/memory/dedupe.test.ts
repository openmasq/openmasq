import { describe, expect, it } from "vitest";
import { NEW_CARD_ENTITY, makeMemoryCard, newCardEntity } from "./memory";
import {
  DUPLICATE_MIN_SIM,
  autoCleanMemory,
  distinctIdentities,
  duplicateSuggestions,
  mergeCards,
  pairKey,
} from "./dedupe";
import type { MemoryCard } from "../types";

const card = (
  entity: string,
  facts: string,
  cat = "personne",
  over: Partial<MemoryCard> = {},
): MemoryCard => ({ ...makeMemoryCard({ entity, facts, cat })!, ...over });

describe("duplicateSuggestions", () => {
  it("SURFACE: a token-subset pair is flagged (« Manon » ⊂ « Manon Verdolini »), longer facts kept", () => {
    const short = card("Manon", "Cliente.", "personne", { createdAt: 5 });
    const full = card("Manon Verdolini", "Cliente principale, dossier fiscal.", "personne", { createdAt: 9 });
    const [s] = duplicateSuggestions([short, full], []);
    expect(s).toMatchObject({ keepId: full.id, dropId: short.id, reason: "surface" });
  });

  it("SURFACE: a shared token that is NOT a subset does not flag (Jean Rebour ≠ Jean Morvan)", () => {
    const a = card("Jean Rebour", "x");
    const b = card("Jean Morvan", "y");
    expect(duplicateSuggestions([a, b], [])).toEqual([]);
  });

  it("SEMANTIC: the threshold still gates the cards the signal is now FOR (no name material)", () => {
    // After the identity guard, the semantic path's remaining job is the cards a name
    // can't separate — notes whose entity carries no distinctive token. There the
    // cosine is the only signal, so the measured 0.945/0.95 bar still decides.
    const a = card("A1", "Points d'équipe le jeudi.", "autre");
    const b = card("B2", "Points d'équipe le jeudi matin.", "autre");
    expect(duplicateSuggestions([a, b], [{ a: a.id, b: b.id, sim: 0.945 }])).toEqual([]);
    const dup = duplicateSuggestions([a, b], [{ a: a.id, b: b.id, sim: 0.96 }]);
    expect(dup).toHaveLength(1);
    expect(dup[0].reason).toBe("semantic");
    expect(DUPLICATE_MIN_SIM).toBeGreaterThan(0.945);
  });

  it("SEMANTIC never merges two DISTINCTLY NAMED people, however close the wording", () => {
    // The reported case: members of one government (or of one company) are described in
    // the same words — « ministre… », « ministre… » — so the embedding says «same», while
    // the names say « two people ». A merge would have folded one into the other and kept
    // the real name of the second as a mere alias. Identity is the name.
    const rebsamen = card("François Rebsamen", "Ministre du gouvernement français, 2026.");
    const ferracci = card("Marc Ferracci", "Ministre du gouvernement français, 2026.");
    for (const sim of [0.96, 0.99, 1]) {
      expect(duplicateSuggestions([rebsamen, ferracci], [{ a: rebsamen.id, b: ferracci.id, sim }])).toEqual([]);
    }
  });

  it("distinctIdentities: disjoint names only — an unnamed card is not « different »", () => {
    expect(distinctIdentities(card("François Rebsamen", "x"), card("Marc Ferracci", "y"))).toBe(true);
    expect(distinctIdentities(card("Karl Studio", "x"), card("Karl", "y"))).toBe(false);
    // No distinctive token on one side ⇒ no evidence of difference (the user confirms).
    expect(distinctIdentities(card("A1", "x"), card("Marc Ferracci", "y"))).toBe(false);
  });

  it("a CROSS-category pair is never suggested (a projet named like an org is two things)", () => {
    const org = card("Nightingale", "Le client.", "organisation");
    const proj = card("Nightingale", "La refonte.", "projet");
    expect(duplicateSuggestions([org, proj], [{ a: org.id, b: proj.id, sim: 0.99 }])).toEqual([]);
  });

  it("one suggestion per pair, surface outranking semantic", () => {
    const a = card("Karl Studio", "Agence de design.", "organisation");
    const b = card("Karl", "Agence.", "organisation");
    const out = duplicateSuggestions([a, b], [{ a: a.id, b: b.id, sim: 0.97 }]);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("surface");
    expect(pairKey(a.id, b.id)).toBe(pairKey(b.id, a.id));
  });
});

describe("mergeCards — data-preserving", () => {
  it("keeps recall by the OLD name: the dropped entity + aliases become aliases", () => {
    const keep = card("Manon Verdolini", "Cliente principale.", "personne", { aliases: ["Manon"] });
    const drop = card("Manon P.", "Préfère le jeudi.", "personne", { aliases: ["manon verdolini"] });
    const merged = mergeCards(keep, drop, 42);
    expect(merged.id).toBe(keep.id);
    expect(merged.facts).toBe("Cliente principale. Préfère le jeudi.");
    // "Manon P." joins; "manon verdolini" is already a known surface (entity) → deduped.
    expect(merged.aliases).toEqual(["Manon", "Manon P."]);
    expect(merged.updatedAt).toBe(42);
  });

  it("contained facts are not duplicated; alias list stays bounded", () => {
    const keep = card("X Corp", "Fournisseur principal basé à Lyon.", "organisation", {
      aliases: ["a1", "a2", "a3", "a4", "a5", "a6"],
    });
    const drop = card("X", "fournisseur principal basé à lyon", "organisation");
    const merged = mergeCards(keep, drop);
    expect(merged.facts).toBe(keep.facts);
    expect(merged.aliases).toHaveLength(6); // cap — "X" doesn't squeeze in past MAX_ALIASES
  });
});

describe("autoCleanMemory — l'auto-nettoyage des doublons CERTAINS", () => {
  /* La régression rapportée : des dizaines de cartes-notes au titre inventé
     (« Préférence de réponse », « Préférence utilisateur »…), toutes portant
     « Préfère des réponses courtes en français ». L'extracteur corrigé ne les crée
     plus ; cette passe résorbe le STOCK — et tout doublon futur, d'où qu'il vienne
     (une fusion de listes par la sync multi-appareils incluse). */

  it("migre les notes auto-préférence vers le PROFIL et les supprime", () => {
    const a = card("Préférence de réponse", "Préfère des réponses courtes en français.", "autre", { source: "auto" });
    const b = card("Préférence utilisateur", "Préfère des réponses courtes en français.", "autre", { source: "auto" });
    const r = autoCleanMemory({ cards: [a, b], profile: "Développeur senior." });
    expect(r.changed).toBe(true);
    expect(r.migrated).toBe(2);
    expect(r.data.cards).toEqual([]);
    // ONE profile line for the two cards (containment dedup), user text kept first.
    expect(r.data.profile).toBe("Développeur senior. Préfère des réponses courtes en français.");
  });

  it("RECOMPACTE une carte qui se redit — quatre reformulations accumulées, une seule survit", () => {
    // Le stock laissé par l'ancien `restates` (cas rapporté 13/08) : la même consigne
    // rejouée, un mot d'emballage d'écart par passage d'extraction.
    const a = card(
      "Atelier Lucane",
      "Atelier Lucane est associé à Camille Salvi dans le cadre du projet Horizon. " +
        "Atelier Lucane est associé à Camille Salvi comme cliente du projet Horizon. " +
        "Atelier Lucane est l'organisation associée à la cliente Camille Salvi. " +
        "Atelier Lucane est la cliente associée à Camille Salvi pour le projet Horizon.",
      "organisation",
      { source: "auto" },
    );
    const r = autoCleanMemory({ cards: [a] });
    expect(r.changed).toBe(true);
    expect(r.data.cards[0].facts.match(/Camille Salvi/g)).toHaveLength(1);
    // Idempotent : la passe suivante ne trouve plus rien à replier.
    expect(autoCleanMemory(r.data).changed).toBe(false);
  });

  it("la recompaction ne replie pas deux faits distincts d'une même carte", () => {
    const a = card("Camille Salvi", "Valide les maquettes du projet Horizon. Préfère les points le jeudi.", "personne", { source: "auto" });
    const r = autoCleanMemory({ cards: [a] });
    expect(r.changed).toBe(false);
    expect(r.data.cards[0].facts).toContain("maquettes");
    expect(r.data.cards[0].facts).toContain("jeudi");
  });

  it("ne touche JAMAIS une carte rédigée par l'utilisateur (pas de `source`)", () => {
    const mine = card("Mes préférences", "Préfère des réponses courtes.", "autre");
    const r = autoCleanMemory({ cards: [mine] });
    expect(r.changed).toBe(false);
    expect(r.data.cards).toEqual([mine]);
  });

  it("fusionne deux cartes de même clé d'entité (même cat), en préservant les données", () => {
    const a = card("Karl Studio", "Fournisseur principal.", "organisation", { createdAt: 1 });
    const b = card("Karl Studio", "Contrat signé en mai.", "organisation", { createdAt: 2, aliases: ["NS"] });
    const r = autoCleanMemory({ cards: [a, b] });
    expect(r.merged).toBe(1);
    expect(r.data.cards).toHaveLength(1);
    const kept = r.data.cards[0];
    expect(kept.facts).toContain("Fournisseur principal");
    expect(kept.facts).toContain("Contrat signé en mai");
    expect(kept.aliases).toContain("NS");
  });

  it("des faits identiques ne fusionnent QUE des notes « autre » — jamais deux personnes", () => {
    const marie = card("Marie Kerner", "Travaille chez Atelier Torbel.", "personne");
    const luc = card("Luc Pernet", "Travaille chez Atelier Torbel.", "personne");
    expect(autoCleanMemory({ cards: [marie, luc] }).changed).toBe(false);
    const n1 = card("Méthode de relance", "Toujours relancer sous 48h.", "autre", { source: "auto" });
    const n2 = card("Règle de relance", "Toujours relancer sous 48h.", "autre", { source: "auto" });
    const r = autoCleanMemory({ cards: [n1, n2] });
    expect(r.merged).toBe(1);
    expect(r.data.cards).toHaveLength(1);
  });

  it("converge en chaîne (A~B, B~C ⇒ une seule carte) et est IDEMPOTENTE", () => {
    const a = card("Atelier Torbel", "Client.", "organisation");
    const b = card("Atelier Torbel", "Basé à Lyon.", "organisation", { aliases: ["AS"] });
    const c = card("AS", "Renouvellement en mars.", "organisation");
    const r = autoCleanMemory({ cards: [a, b, c] });
    expect(r.data.cards).toHaveLength(1);
    const again = autoCleanMemory(r.data);
    expect(again.changed).toBe(false); // fixpoint — the caller can run it on every change
    expect(again.data).toBe(r.data);
  });
});

describe("la fiche VIERGE (« Nouvelle fiche »)", () => {
  it("deux placeholders successifs SURVIVENT au nettoyage automatique", () => {
    const a = card(NEW_CARD_ENTITY, "", "personne", { createdAt: 1 });
    const b = card(newCardEntity([a]), "", "personne", { createdAt: 2 });
    const res = autoCleanMemory({ cards: [b, a] });
    expect(res.data.cards.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("et ne remplissent pas « À revoir » d'un doublon imaginaire", () => {
    const a = card(NEW_CARD_ENTITY, "", "personne");
    const b = card(`${NEW_CARD_ENTITY} 2`, "", "personne");
    expect(duplicateSuggestions([a, b], [])).toEqual([]);
    // Une fiche vierge n'est proposée à la fusion par AUCUN des deux signaux.
    const real = card("Manon Verdolini", "Cliente principale.", "personne");
    const empty = card("Manon", "", "personne");
    expect(duplicateSuggestions([real, empty], [])).toEqual([]);
    expect(duplicateSuggestions([real, empty], [{ a: real.id, b: empty.id, sim: 0.99 }])).toEqual([]);
  });
});
