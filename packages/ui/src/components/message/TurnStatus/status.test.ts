import { describe, expect, it } from "vitest";
import { turnStatusOf } from "./status";

const failedCall = [{ tool: "gmail__send", server: "gmail", ok: false }];

/** One slot, one reason — pinned so the four former conditionals cannot come back as
 *  two cards stacked under the same reply. */
describe("turnStatusOf — un seul statut par tour", () => {
  it("se tait tant que le tour est en cours, et sur un tour ordinaire", () => {
    expect(turnStatusOf({ pending: true, error: true, content: "" })).toBeNull();
    expect(turnStatusOf({ content: "Bonjour" })).toBeNull();
  });

  it("les crédits épuisés prennent la carte crédits, même avec le drapeau d'erreur", () => {
    expect(
      turnStatusOf({ error: true, errorAction: { kind: "credit_options", provider: "openai" }, content: "" }),
    ).toEqual({ kind: "credits" });
  });

  it("une erreur persistée l'emporte sur une interruption et sur une étape échouée", () => {
    expect(turnStatusOf({ error: true, incomplete: true, toolCalls: failedCall, content: "" })).toEqual({
      kind: "card",
      reason: "error",
    });
  });

  it("une réponse coupée dit « interrompue » quand il reste du texte, « vide » sinon", () => {
    expect(turnStatusOf({ incomplete: true, content: "Voici le début" })).toEqual({ kind: "card", reason: "interrupted" });
    expect(turnStatusOf({ incomplete: true, content: " \n" })).toEqual({ kind: "card", reason: "empty" });
  });

  it("une étape d'outil échouée sous un tour réglé prend la variante « tool »", () => {
    expect(turnStatusOf({ content: "J'ai essayé.", toolCalls: failedCall })).toEqual({ kind: "card", reason: "tool" });
  });
});
