import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { applyTokenFragments } from "./tokenFragments";

const key = "ab".repeat(32);

describe("token mode replays the fragments of a known person", () => {
  it("catches the standalone surname or first name of a vaulted person, Title-case and CAPS", () => {
    const vault = { "[PERSON1]": "Jean Dupont", "[PERSON2]": "Léa Morvan", "[EMAIL1]": "x@y.io" };
    expect(
      applyTokenFragments(
        "Dupont est parti. DUPONT aussi ; Jean revient. Morvan signe.",
        vault,
        new Set(),
      ),
    ).toBe("[PERSON1] est parti. [PERSON1] aussi ; [PERSON1] revient. [PERSON2] signe.");
  });

  it("leaves a lower-case fragment, a short one, an excluded person and a token's own word alone", () => {
    const vault = { "[PERSON1]": "Marc Petit", "[PERSON2]": "Ana Blanc" };
    const text = "un petit café ; Petit arrive ; Ana passe ; Blanc reste ; [PERSON1] est là";
    expect(applyTokenFragments(text, vault, new Set(["[PERSON2]"]))).toBe(
      "un petit café ; [PERSON1] arrive ; Ana passe ; Blanc reste ; [PERSON1] est là",
    );
  });

  it("points a variant spelling's fragment at the canonical token", () => {
    const vault = { "[PERSON1]": "Léa Morvan", "[PERSON1b]": "L. Morvan" };
    expect(applyTokenFragments("Morvan signe.", vault, new Set())).toBe("[PERSON1] signe.");
  });

  it("holds end to end: a name vaulted by a stricter pass stays masked, fragments included, in a pass that detects no name", async () => {
    const vault = {};
    // A tool result masked with names ON (forced here: no on-device model in the test).
    const strict = await pseudonymize("Compte-rendu : Jean Dupont valide le devis.", {
      vault,
      mode: "token",
      key,
      disabledKinds: [],
      numbers: false,
      forced: [{ value: "Jean Dupont", category: "name" }],
    });
    expect(strict.text).toBe("Compte-rendu : [PERSON1] valide le devis.");
    // The chat, with names OFF, same vault: nothing detects a name, the vault still speaks.
    const standard = await pseudonymize(
      "Jean est parti. DUPONT aussi. Jean Dupont revient demain.",
      {
        vault,
        mode: "token",
        key,
        numbers: false,
        disabledKinds: ["name", "username", "company", "address", "city"],
      },
    );
    expect(standard.text).toBe("[PERSON1] est parti. [PERSON1] aussi. [PERSON1] revient demain.");
  });
});
