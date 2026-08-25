import { describe, expect, it } from "vitest";
import { pseudonymize, unredact, type Vault } from "./index";

/* Manual "force redact" (the composer's Redact → chosen type): a user-selected
   span is redacted AS the given canonical category, reversibly, even when the
   detectors would not catch it — and it bypasses a disabled category, but `keep`
   still wins (the reveal / undo path). */

describe("pseudonymize `forced` (manual redaction)", () => {
  it("redacted a forced value as its chosen kind, reversibly", async () => {
    const vault: Vault = {};
    const input = "Le projet interne Zephyrus démarre lundi.";
    const { text, matches } = await pseudonymize(input, {
      vault,
      forced: [{ value: "Zephyrus", category: "ORG" }],
    });
    expect(text).not.toContain("Zephyrus"); // the real value never leaves
    expect(matches.some((m) => m.value === "Zephyrus")).toBe(true);
    expect(unredact(text, vault)).toBe(input); // fully restored on the reply
  });

  it("forces a value case-INSENSITIVELY — a Coffre term masks another casing too (audit)", async () => {
    const vault: Vault = {};
    const input = "Le projet Nightingale avance ; le rollout nightingale est prévu.";
    const { text } = await pseudonymize(input, {
      vault,
      forced: [{ value: "Nightingale", category: "ORG" }], // user added ONE casing
    });
    // BOTH casings must leave the machine redacted — the exact-case gate used to ship the
    // lower-cased occurrence in clear.
    expect(text).not.toContain("Nightingale");
    expect(text.toLowerCase()).not.toContain("nightingale");
    expect(unredact(text, vault)).toBe(input); // reversible, casing preserved
  });

  it("forces even when the category is DISABLED (user asked explicitly)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Client: Globex Corp.", {
      vault,
      forced: [{ value: "Globex", category: "ORG" }],
      disabledKinds: ["company"], // company detection off — forced still wins
    });
    expect(text).not.toContain("Globex");
  });

  it("`keep` overrides `forced` (the reveal / undo path)", async () => {
    const vault: Vault = {};
    const input = "Utilise Globex pour la démo.";
    const { text } = await pseudonymize(input, {
      vault,
      forced: [{ value: "Globex", category: "ORG" }],
      keep: ["Globex"], // the user revealed it → stays in clear
    });
    expect(text).toContain("Globex");
  });

  it("`keep` does NOT override an ORG-MANDATED (unrevealable) category (audit)", async () => {
    const input = "Contacte marcus@acme.com pour la démo.";
    // Baseline: without the org mandate, `keep` wins → the email ships in CLEAR.
    const clear = await pseudonymize(input, { vault: {}, keep: ["marcus@acme.com"] });
    expect(clear.text).toContain("marcus@acme.com");
    // With `email` org-forced (a member can't reveal it), `keep` must NOT win → redacted + reversible.
    const vault: Vault = {};
    const guarded = await pseudonymize(input, {
      vault,
      keep: ["marcus@acme.com"],
      unrevealableCategories: ["email"],
    });
    expect(guarded.text).not.toContain("marcus@acme.com");
    expect(unredact(guarded.text, vault)).toBe(input);
  });

  it("forces a value the detectors never flag (a bare word) with the chosen type", async () => {
    const vault: Vault = {};
    const { text, matches } = await pseudonymize("Réf dossier: MIRABELLE.", {
      vault,
      forced: [{ value: "MIRABELLE", category: "NAME" }],
    });
    expect(text).not.toContain("MIRABELLE");
    expect(matches[0]?.value).toBe("MIRABELLE");
  });

  it("REGRESSION (Mémoire injection): the forced entity is redacted in the whole block", async () => {
    // The exact send-pipeline shape: the memory block is pseudonymized with the
    // card's entity as `forced`. It used to leak WHOLE: the header's « tel quel) : »
    // read as a PHONE label, the entire card line became one vault entry, and its
    // "fake" was the original + "-2" — so the model received the real facts verbatim
    // and the forced entity was swallowed by the bigger span (never mapped).
    const block =
      "Mémoire de l'utilisateur (contexte durable, à utiliser sans le réciter tel quel) :\n" +
      "- Zorvia (organisation) : Zorvia est une organisation a but non lucratif";
    const vault: Vault = {};
    const { text } = await pseudonymize(block, {
      vault,
      forced: [{ value: "Zorvia", category: "ORG" }],
      numbers: false,
      salt: 7,
    });
    // The entity never leaves in clear — in the header line NOR inside the facts.
    expect(text).not.toContain("Zorvia");
    // No vault KEY (what leaves the machine) may contain the real value either.
    for (const fake of Object.keys(vault)) expect(fake.toLowerCase()).not.toContain("zorvia");
    expect(unredact(text, vault)).toBe(block); // reversible, as always
  });

  it("an exhausted/identity faker can never emit a fake CONTAINING the original", async () => {
    // A forced value with a numeric category but no digit makes the digit-faker an
    // identity pass-through → every attempt collides → the suffixed fallback. That
    // fallback must fall to a neutral base, never "<original>-2" (a verbatim leak).
    const input = "note interne: réunion budget lundi prochain.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      vault,
      forced: [{ value: "réunion budget lundi", category: "PHONE" }],
    });
    expect(text).not.toContain("réunion budget lundi");
    for (const fake of Object.keys(vault))
      expect(fake.toLowerCase()).not.toContain("réunion budget lundi");
    expect(unredact(text, vault)).toBe(input);
  });
});
