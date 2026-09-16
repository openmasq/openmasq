
import { describe, expect, it, } from "vitest";
import { exhaustionMessage, } from "./mcpAgent";

describe("exhaustionMessage — une PANNE d'outil n'accuse pas le modèle", () => {
  /**
   * Log of 04/08: `gmail__get_message` failed twelve times (404 notFound) on DIFFERENT
   * identifiers, and the user read « le modèle relançait le même appel au lieu de
   * changer d'approche », followed by « essayez un modèle plus capable » and « vérifiez
   * que le connecteur expose bien l'action ». All three were false: the model had varied
   * its calls, the connector did expose the action (other calls succeeded), and no model
   * repairs a 404.
   */
  const base = {
    callCounts: new Map([["gmail__get_message", 12]]),
    repeatedResult: new Map([["gmail__get_message", 2]]),
    argErrored: new Set<string>(),
    succeeded: new Set<string>(["gmail__search_messages"]),
    maxTurns: 8,
    stopped: "stuck" as const,
  };

  it("dit que c'est l'OUTIL qui ne répond pas, et montre son erreur", () => {
    const msg = exhaustionMessage({
      ...base,
      repeatedFailure: {
        tool: "gmail__get_message",
        error: "Lecture Gmail impossible : Upstream request failed (404): notFound",
        distinctInputs: 6,
      },
    });
    expect(msg).toContain("sur des entrées différentes");
    expect(msg).toContain("c'est l'outil qui ne répond pas");
    expect(msg).toContain("404");
    // The three false pieces of advice are gone.
    expect(msg).not.toContain("relançait le même appel");
    expect(msg).not.toContain("modèle plus capable");
    expect(msg).not.toContain("expose bien l'action");
  });

  it("distingue une vraie répétition du MÊME appel", () => {
    const msg = exhaustionMessage({
      ...base,
      repeatedFailure: { tool: "gmail__get_message", error: "404 notFound", distinctInputs: 1 },
    });
    expect(msg).toContain("sur le MÊME appel");
    expect(msg).not.toContain("entrées différentes");
  });

  it("sans panne, garde le diagnostic « le modèle tourne en rond »", () => {
    const msg = exhaustionMessage(base);
    expect(msg).toContain("relançait le même appel");
  });
});

describe("exhaustionMessage", () => {
  const base = {
    callCounts: new Map<string, number>(),
    repeatedResult: new Map<string, number>(),
    argErrored: new Set<string>(),
    succeeded: new Set<string>(),
    maxTurns: 8,
  };

  it("names a tool stuck repeating the same result", () => {
    const msg = exhaustionMessage({
      ...base,
      callCounts: new Map([["stripe__stripe_api_search", 7]]),
      repeatedResult: new Map([["stripe__stripe_api_search", 5]]),
      succeeded: new Set(["stripe__stripe_api_search"]),
    });
    expect(msg).toContain("Limite d'appels d'outils atteinte (8 tours, 7 appels)");
    // The tool is NAMED, but in the product's language: `stripe__stripe_api_search`
    // designates nothing to whoever reads this message (13/08).
    expect(msg).toContain("(Stripe)");
    expect(msg).not.toContain("stripe__stripe_api_search");
    expect(msg).toMatch(/6 fois/); // repeats(5) + 1
  });

  it("uses the early-stop header when the loop was hard-stopped (stuck)", () => {
    const msg = exhaustionMessage({
      ...base,
      stopped: "stuck",
      callCounts: new Map([["stripe__stripe_api_search", 3]]),
      repeatedResult: new Map([["stripe__stripe_api_search", 2]]),
      succeeded: new Set(["stripe__stripe_api_search"]),
    });
    expect(msg).toContain("Boucle d'outils interrompue");
    expect(msg).not.toContain("Limite d'appels d'outils atteinte");
    expect(msg).toMatch(/3 fois/); // repeats(2) + 1
  });

  it("names tools with unrecovered arg/JSON errors", () => {
    const msg = exhaustionMessage({
      ...base,
      callCounts: new Map([["webflow__update", 2]]),
      argErrored: new Set(["webflow__update"]),
    });
    expect(msg).toContain("appel valide");
    expect(msg).toContain("Mise à jour");
    expect(msg).not.toContain("webflow__update");
  });

  it("does not flag an arg-errored tool that later succeeded", () => {
    const msg = exhaustionMessage({
      ...base,
      callCounts: new Map([["t", 3]]),
      argErrored: new Set(["t"]),
      succeeded: new Set(["t"]),
    });
    expect(msg).not.toContain("appel valide");
    expect(msg).toContain("sans converger");
  });

  // A web search that does not get there is not a model failure: the path was the right
  // one. « Changez de modèle » is bad advice there.
  it("dit qu'une RECHERCHE s'est arrêtée, sans accuser le modèle ni suggérer d'en changer", () => {
    const msg = exhaustionMessage({
      ...base,
      stopped: "stuck",
      callCounts: new Map([["browser__browser_navigate", 20]]),
      succeeded: new Set(["browser__browser_navigate"]),
      hammered: { tool: "browser__browser_navigate", web: true },
    });
    expect(msg).toContain("20 pages consultées");
    expect(msg).toContain("précisez la cible");
    expect(msg).not.toMatch(/modèle plus capable/);
    expect(msg).not.toContain("Boucle d'outils interrompue");
  });

  it("nomme l'outil martelé quand ce n'est PAS une lecture web", () => {
    const msg = exhaustionMessage({
      ...base,
      stopped: "stuck",
      callCounts: new Map([["posthog__exec", 8]]),
      succeeded: new Set(["posthog__exec"]),
      hammered: { tool: "posthog__exec", web: false },
    });
    // Named — in the product's language, never in `snake_case` (13/08).
    expect(msg).toContain("8 appels à **Exécution** (PostHog)");
    expect(msg).not.toContain("posthog__exec");
    expect(msg).toContain("modèle plus capable"); // the usual advice stays
  });
});
