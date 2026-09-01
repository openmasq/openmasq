import { describe, it, expect } from "vitest";
import type { MemoryCard, MemoryData } from "../types";
import { selectMemory } from "./select";

/**
 * Pulling the NEIGHBOURHOOD of a named entity into the prompt.
 *
 * The failure that asked for it: « fais de la veille sur les fournisseurs de Karl Studio ».
 * The Karl Studio card went in; the card describing a COMPETITOR of Karl Studio did not,
 * because the typed text never says « Dropbox ». The model answered as though nothing was
 * known around the company. A card that NAMES the entity is about it.
 */
let n = 0;
const card = (entity: string, facts: string, cat = "organisation"): MemoryCard =>
  ({ id: `c${++n}`, entity, facts, cat, updatedAt: n }) as MemoryCard;

const store = (...cards: MemoryCard[]): MemoryData => ({ cards }) as MemoryData;

const names = (m: MemoryData, text: string, budgetChars = 4000): string[] =>
  selectMemory({ text, convValues: [], memory: m, budgetChars }).cards.map((c) => c.entity);

describe("un cran de voisinage autour d'une entité NOMMÉE", () => {
  const karl = card("Karl Studio", "Plateforme cloud audio, fondée en 2022");
  const dropbox = card("Dropbox", "Concurrent élargi probable de Karl Studio");
  const sansRapport = card("Mairie de Lyon", "Interlocuteur pour les subventions");

  it("tire la fiche qui NOMME l'entité citée", () => {
    expect(names(store(karl, dropbox, sansRapport), "veille sur les fournisseurs de Karl Studio"))
      .toEqual(["Karl Studio", "Dropbox"]);
  });

  it("laisse dehors ce qui n'a aucun lien", () => {
    const out = names(store(karl, dropbox, sansRapport), "veille sur Karl Studio");
    expect(out).not.toContain("Mairie de Lyon");
  });

  it("le lien joue dans les DEUX sens", () => {
    // Here it's the CITED card that names the other, not the reverse.
    const studio = card("Karl Studio", "Travaille avec Ambrell Works pour le design");
    const ambrell = card("Ambrell Works", "Agence de design");
    expect(names(store(studio, ambrell), "parle-moi de Karl Studio")).toContain("Ambrell Works");
  });
});

describe("ce que l'expansion ne doit PAS faire", () => {
  it("ne part JAMAIS d'une correspondance faible", () => {
    // « Manon » alone is a score of 1 (distinctive token). Expanding from there would snowball
    // onto cards the user never designated.
    const manon = card("Manon Verdolini", "Cliente historique", "personne");
    const autre = card("Ostrel", "Fournisseur de Manon Verdolini");
    expect(names(store(manon, autre), "des nouvelles de Manon ?")).toEqual(["Manon Verdolini"]);
  });

  it("ne fait qu'UN saut — le voisin du voisin reste dehors", () => {
    const a = card("Karl Studio", "Plateforme audio");
    const b = card("Dropbox", "Concurrent de Karl Studio");
    const c = card("Acme", "Partenaire de Dropbox");
    expect(names(store(a, b, c), "veille sur Karl Studio")).toEqual(["Karl Studio", "Dropbox"]);
  });

  it("sert les fiches DIRECTES avant les voisines quand le budget est serré", () => {
    // A budget that only fits one card must keep the one the user named.
    const m = store(card("Karl Studio", "Plateforme audio"), card("Dropbox", "Concurrent de Karl Studio"));
    const sel = selectMemory({ text: "veille sur Karl Studio", convValues: [], memory: m, budgetChars: 90 });
    expect(sel.cards.map((c) => c.entity)).toEqual(["Karl Studio"]);
    // The dropped NEIGHBOUR is not a surprising miss (the user didn't name it):
    // it never pollutes the diagnostic.
    expect(sel.skipped).toEqual([]);
  });
});
