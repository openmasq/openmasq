import { describe, expect, it } from "vitest";
import { compactToolHistory } from "./mcpAgentUtil";

describe("compactToolHistory (compression de l'historique d'outils)", () => {
  const msg = (role: string, content: string) => ({ role, content });
  it("tronque les tool-results ANTÉRIEURS aux 2 derniers tours assistant, préserve le reste", () => {
    const big = "x".repeat(1000);
    const msgs = [
      msg("system", "sys"),
      msg("user", "question"),
      msg("assistant", "tour1"),
      msg("tool", big), // ancien → tronqué
      msg("assistant", "tour2"),
      msg("tool", big), // fenêtre récente → intact
      msg("assistant", "tour3"),
      msg("tool", big), // récent → intact
    ];
    const out = compactToolHistory(msgs);
    expect(out[3].content.length).toBeLessThan(500);
    expect(out[3].content).toContain("tronqué");
    expect(out[5].content).toBe(big);
    expect(out[7].content).toBe(big);
    // Jamais les legs user/system/assistant, et les originaux restent INTACTS.
    expect(out[0].content).toBe("sys");
    expect(msgs[3].content).toBe(big);
  });
  it("no-op sous 2 tours ou sous le seuil de taille", () => {
    const msgs = [msg("user", "q"), msg("assistant", "a"), msg("tool", "court")];
    expect(compactToolHistory(msgs)).toEqual(msgs);
  });
});
