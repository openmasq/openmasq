import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, type McpConnector } from "@openmasq/catalog/mcp";
import { isStrongMatch, matchStrength, normalise, servedBy, NOTHING_SERVED } from "./integrationRelevance";

const pick = (id: string): McpConnector => MCP_CONNECTORS.find((c) => c.id === id)!;
const strength = (text: string, id: string, connected: string[] = []) =>
  matchStrength(normalise(text), pick(id), connected.length ? servedBy(connected.map(pick)) : NOTHING_SERVED);

/**
 * The bar every integration card must clear — whichever path raises it. The turn that
 * set it (2026-08): a follow-up letter carrying an address and the word « courrier »
 * produced Square AND Gmail cards under a reply that was about neither.
 */
describe("integrationRelevance — une correspondance FORTE, jamais une coïncidence", () => {
  const LETTER =
    "Rédige une lettre de relance pour la facture n° 2024-18 de M. Dupont, 3 square des " +
    "Peupliers, restée impayée malgré deux courriers. Ton ferme mais courtois.";

  it("une adresse e-mail ou une URL ne nomme pas le service (« jean@gmail.com » ⇒ rien)", () => {
    expect(strength("Rédige une réponse à Jean Dupont (jean.dupont@gmail.com) pour son dossier.", "gmail")).toBeNull();
    expect(strength("Le lien est sur drive.google.com/file/abc — résume-le.", "google-drive")).toBeNull();
  });
  it("une lettre de relance ne propose ni Square (une adresse) ni Gmail (un courrier)", () => {
    expect(strength(LETTER, "square")).toBeNull();
    expect(strength(LETTER, "gmail")).toBeNull();
    expect(strength(LETTER, "stripe")).toBeNull();
  });

  it("une marque qui est aussi un mot ordinaire ne compte qu'en POSITION de service", () => {
    expect(strength("sur Square, combien de ventes hier ?", "square")).toBe("brand");
    expect(strength("résume mes pages Notion", "notion")).toBe("brand");
    expect(strength("c'est une notion difficile", "notion")).toBeNull();
    expect(strength("une progression linéaire, pas linear", "linear")).toBeNull();
    expect(strength("mes tickets dans Linear", "linear")).toBe("brand");
  });

  it("une marque sans ambiguïté compte nue", () => {
    expect(strength("combien en caisse sur Stripe ?", "stripe")).toBe("brand");
    expect(strength("va voir Stripe", "stripe")).toBe("brand");
    expect(strength("récupère aussi mes mails sur Outlook", "microsoft-outlook", ["gmail"])).toBe("brand");
  });

  it("un IMPÉRATIF adressé à l'assistant vaut demande — l'infinitif d'un projet, non", () => {
    expect(strength("envoie-la par mail à M. Dupont", "gmail")).toBe("action");
    expect(strength("réponds à ce mail en refusant poliment", "gmail")).toBe("action");
    expect(strength("planifie une réunion avec Paul jeudi", "google-calendar")).toBe("action");
    // The 11/08 turn: talking about a mailing one is going to do is not an ask.
    expect(
      strength("je vais envoyer des emails product à un peu moins de 100 personnes, ai-je besoin de warmup ?", "gmail"),
    ).toBeNull();
    expect(strength("on s'est parlé par mail hier", "gmail")).toBeNull();
    // « programme » is a noun as often as a verb — never an ask on its own.
    expect(strength("prépare le programme de la réunion", "google-calendar")).toBeNull();
  });

  it("un besoin déjà servi ne propose pas un second fournisseur", () => {
    expect(strength("envoie un mail à Paul", "microsoft-outlook", ["gmail"])).toBeNull();
    expect(strength("Revue de ma boîte mail", "microsoft-outlook", ["gmail"])).toBeNull();
    // …but the calendar need is not served by a mailbox.
    expect(strength("planifie une réunion jeudi", "google-calendar", ["gmail"])).toBe("action");
  });

  it("isStrongMatch est le même juge, sur du texte brut", () => {
    expect(isStrongMatch("trie mes mails de la semaine", pick("gmail"))).toBe(true);
    expect(isStrongMatch(LETTER, pick("gmail"))).toBe(false);
    expect(isStrongMatch("", pick("gmail"))).toBe(false);
  });
});
