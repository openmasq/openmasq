import { describe, expect, it } from "vitest";
import { applyVault } from "../../engine/vault";
import { pseudonymize } from "./index";
import { replayForModel } from "./replay";

// A past text goes back to the model through `replayForModel` — the SAME substitution as at
// send time. `applyVault` alone is exact-case: a variant the tolerant pass masked when it was
// typed would leave in clear on every later turn.
describe("replayForModel", () => {
  const KEY = "a".repeat(64);

  it("masks on replay the case variant the send masked", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Rendez-vous avec Jean Dupont chez Acmeplex.", {
      vault,
      key: KEY,
      forced: [
        { value: "Jean Dupont", category: "name" },
        { value: "Acmeplex", category: "company" },
      ],
    });
    const typed = "Relance DUPONT et ACMEPLEX demain.";
    const sent = (await pseudonymize(typed, { vault, key: KEY })).text;
    expect(sent).not.toMatch(/DUPONT|ACMEPLEX/);
    // The replay of that same past text: identical to what went out, never the real case.
    expect(replayForModel(typed, vault)).toBe(sent);
    // The gap it closes: the exact-case pass alone leaves both in clear.
    expect(applyVault(typed, vault)).toMatch(/DUPONT/);
  });

  it("keeps an excluded category in clear, as the send does", () => {
    const vault = { "Eudes Quémener": "Jean Dupont" };
    expect(replayForModel("Voir Jean Dupont.", vault, { exclude: new Set(["Eudes Quémener"]) })).toBe(
      "Voir Jean Dupont.",
    );
  });
});
