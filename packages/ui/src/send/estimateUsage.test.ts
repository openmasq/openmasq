import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@openmasq/llm";
import { estimateTurnUsage } from "./estimateUsage";

const history: ChatMessage[] = [
  { role: "system", content: "x".repeat(400) },
  { role: "user", content: "y".repeat(200) },
];

describe("estimateTurnUsage — un tour interrompu n'est jamais compté zéro", () => {
  it("compte l'entrée ET la sortie partielle", () => {
    const u = estimateTurnUsage(history, "z".repeat(120));
    expect(u.inputTokens).toBeGreaterThan(140); // ~600 chars / 4
    expect(u.outputTokens).toBeGreaterThan(28); // ~120 chars / 4
  });

  it("une sortie VIDE laisse quand même l'entrée : le prompt a bien été envoyé", () => {
    // The immediate-Stop case. The provider received and processed the prompt — billed —
    // even if nothing has come back yet. Zero would be wrong in the other direction.
    const u = estimateTurnUsage(history, "");
    expect(u.inputTokens).toBeGreaterThan(140);
    expect(u.outputTokens).toBeGreaterThan(0); // the per-message overhead, not a net 0
  });

  it("plus le flux a produit, plus l'estimation monte — c'est monotone", () => {
    const short = estimateTurnUsage(history, "a".repeat(100)).outputTokens;
    const long = estimateTurnUsage(history, "a".repeat(4000)).outputTokens;
    expect(long).toBeGreaterThan(short * 5);
  });

  it("reste dans ~±25 % du décompte réel d'un fournisseur sur du texte courant", () => {
    // Sanity anchor on the chars/4 heuristic: a French reply of ~1200 characters weighs
    // ~300 tokens. The estimate must bracket that order of magnitude — being off by 10 %
    // is infinitely better than being off by 100 % (zero).
    const out = estimateTurnUsage([], "Bonjour, voici une réponse. ".repeat(43)).outputTokens;
    expect(out).toBeGreaterThan(225);
    expect(out).toBeLessThan(375);
  });
});
