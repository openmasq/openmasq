import { afterEach, describe, expect, it } from "vitest";
import type { Section } from "../../types";
import {
  __resetFeatureAccess,
  enabledSections,
  featureAccess,
  featureUsage,
  isGated,
  sectionOrFallback,
  setFeatureAccess,
  setFeatureAccessFromFlags,
} from "./featureAccess";

const ALL: Section[] = ["chats", "library", "vault", "competences", "memory", "settings"];

afterEach(() => __resetFeatureAccess());

describe("featureAccess — les défauts", () => {
  it("sans réponse, tout est OUVERT : le défaut sûr est « le produit tel qu'il est livré »", () => {
    // A relay outage must not strip three sections from the fleet.
    expect(featureAccess("memory")).toBe(true);
    expect(featureAccess("library")).toBe(true);
    expect(featureAccess("competences")).toBe(true);
    expect(enabledSections(ALL)).toEqual(ALL);
  });

  it("une réponse illisible laisse le défaut — on ne croit pas le serveur sur parole", () => {
    setFeatureAccessFromFlags({ "hide-memory": "control", inconnu: false });
    expect(featureAccess("memory")).toBe(true);
  });
});

/* ⚠️ THE TRAP THAT DECIDED THE POLARITY, measured against real PostHog (17/08):
   a DISABLED flag is not rendered `false`, it is ABSENT from the response. With
   "allow"-style keys, the dashboard's "Disable" button — the most
   obvious gesture — would therefore have closed nothing, silently. These cases pin that all THREE
   ways of saying nothing fall back to OPEN, and that only one gesture closes. */
describe("polarité : le drapeau dit CACHER", () => {
  it("clé absente (jamais créée, désactivée, ou relais muet) ⇒ OUVERT", () => {
    setFeatureAccessFromFlags({ "hide-competences": true });
    expect(featureAccess("competences")).toBe(false);
    // The other two weren't in the response: they stay open.
    expect(featureAccess("memory")).toBe(true);
    expect(featureAccess("library")).toBe(true);
  });

  it("réponse VIDE (PostHog injoignable) ⇒ tout reste ouvert", () => {
    setFeatureAccessFromFlags({ "hide-memory": true });
    expect(featureAccess("memory")).toBe(false);
    setFeatureAccessFromFlags({});
    expect(featureAccess("memory")).toBe(true);
  });

  it("`hide-x: false` (drapeau actif, déploiement à 0 %) ⇒ ouvert", () => {
    setFeatureAccessFromFlags({ "hide-memory": false, "hide-library": false });
    expect(featureAccess("memory")).toBe(true);
    expect(featureAccess("library")).toBe(true);
  });

  it("`hide-x: true` est le SEUL geste qui ferme", () => {
    setFeatureAccessFromFlags({ "hide-library": true });
    expect(featureAccess("library")).toBe(false);
  });
});

describe("featureAccess — la porte", () => {
  it("fermer un accès retire la section, et rien d'autre", () => {
    setFeatureAccess({ memory: false });
    expect(enabledSections(ALL)).toEqual(["chats", "library", "vault", "competences", "settings"]);
    expect(featureAccess("library")).toBe(true);
  });

  it("les sections non gouvernées ne se ferment jamais", () => {
    expect(isGated("chats")).toBe(false);
    expect(isGated("vault")).toBe(false);
    expect(isGated("settings")).toBe(false);
    setFeatureAccess({ memory: false, library: false, competences: false });
    expect(enabledSections(ALL)).toEqual(["chats", "vault", "settings"]);
  });

  it("viser une section fermée renvoie aux conversations, jamais dans un cul-de-sac", () => {
    setFeatureAccess({ memory: false });
    expect(sectionOrFallback("memory")).toBe("chats");
    expect(sectionOrFallback("library")).toBe("library");
    expect(sectionOrFallback("settings")).toBe("settings");
  });

  it("lit la forme PostHog (clé de drapeau → booléen)", () => {
    setFeatureAccessFromFlags({ "hide-competences": true });
    expect(featureAccess("competences")).toBe(false);
    expect(featureAccess("memory")).toBe(true);
  });
});

describe("featureUsage — porte fermée ≠ fonctionnalité coupée", () => {
  /* ⚠️ These two cases are the product DECISION, not an implementation detail:
     Mémoire and Bibliothèque keep running with the door closed. If one
     of them breaks because someone "disabled memory", it's the
     fix that's wrong, not the test. */
  it("Mémoire : porte fermée, l'usage CONTINUE (injection, recherche, extraction)", () => {
    setFeatureAccess({ memory: false });
    expect(featureAccess("memory")).toBe(false);
    expect(featureUsage("memory")).toBe(true);
  });

  it("Bibliothèque : porte fermée, les fichiers continuent d'arriver", () => {
    setFeatureAccess({ library: false });
    expect(featureAccess("library")).toBe(false);
    expect(featureUsage("library")).toBe(true);
  });

  it("Compétences : porte fermée, l'usage s'arrête AUSSI", () => {
    setFeatureAccess({ competences: false });
    expect(featureAccess("competences")).toBe(false);
    expect(featureUsage("competences")).toBe(false);
  });

  it("porte ouverte, tout est utilisable", () => {
    expect(featureUsage("memory")).toBe(true);
    expect(featureUsage("competences")).toBe(true);
  });
});
