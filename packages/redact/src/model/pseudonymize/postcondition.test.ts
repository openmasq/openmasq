import { describe, it, expect } from "vitest";
import { pseudonymize, unredact } from "../../index";
import { reconcileMatches, UNREVERSIBLE_ERROR } from "./postcondition";

/**
 * The single exit postcondition: what `pseudonymize` REPORTS as redacted must match
 * what it actually did. `matches` drives the UI's redaction marks, the persisted
 * `redactedSpans` and the privacy report — a match claiming a redaction that never
 * happened tells the user a value is protected while it sits on the wire.
 */
const detects = (...vals: { value: string; category: string }[]) =>
  async () => JSON.stringify(vals);

describe("pseudonymize — reported ⇒ vaulted ⇒ substituted", () => {
  it("every reported match is REVERSIBLE (its placeholder maps back to the real value)", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("Léa Morvan travaille chez Karl Studio", {
      vault,
      numbers: false,
      complete: detects({ value: "Léa Morvan", category: "NAME" }, { value: "Karl Studio", category: "ORG" }),
    });
    expect(r.matches.length).toBeGreaterThan(0);
    for (const m of r.matches) expect(vault[m.placeholder]).toBe(m.value);
  });

  it("never reports a redaction it did not perform: a KEPT value is not a match", async () => {
    // Turn 1 vaults the company.
    const vault: Record<string, string> = {};
    await pseudonymize("Contrat avec Karl Studio", {
      vault,
      numbers: false,
      complete: detects({ value: "Karl Studio", category: "ORG" }),
    });
    expect(Object.values(vault)).toContain("Karl Studio");

    // Turn 2 keeps it in clear. The value legitimately stays on the wire — so it
    // must NOT be reported as redacted. (Before the postcondition, `matches` and
    // the wire text could disagree and the UI showed a mark over a real value.)
    const r = await pseudonymize("Contrat avec Karl Studio, suite", {
      vault,
      numbers: false,
      keep: ["Karl Studio"],
      complete: detects({ value: "Karl Studio", category: "ORG" }),
    });
    expect(r.text).toContain("Karl Studio"); // in clear, as asked
    expect(r.matches.some((m) => m.value === "Karl Studio")).toBe(false); // and not claimed
  });

  // The whole-class guard: whatever the caller disables, a reported match is never a lie.
  it("holds under a disabled category — no match survives that wasn't substituted", async () => {
    const r = await pseudonymize("Léa Morvan est ici", {
      vault: {},
      numbers: false,
      disabledKinds: ["secret"],
      kinds: {},
      complete: detects({ value: "Léa Morvan", category: "NAME" }),
    });
    for (const m of r.matches) expect(r.text).not.toContain(m.value);
  });

  // A name back in a casing `recaseLike` cannot spell (« McDonald » → « Mcdonald »)
  // lands on the fake already vaulted for the first casing. The variant pass masks it,
  // so the send must go through and the reply restore the same person.
  it.each([
    ["Jean McDonald", "Jean Mcdonald"],
    ["Anne DeLaRue", "Anne Delarue"],
    ["Karl Studio", "KaRL Studio"],
  ])("an intra-word casing variant (%s → %s) is masked, not refused", async (first, again) => {
    const vault: Record<string, string> = {};
    await pseudonymize(`Contact : ${first}`, { vault, numbers: false, complete: detects({ value: first, category: "NAME" }) });
    const r = await pseudonymize(`Relance ${again} demain`, {
      vault,
      numbers: false,
      complete: detects({ value: again, category: "NAME" }),
    });
    expect(r.modelError).toBeUndefined();
    expect(r.text).not.toContain(again);
    expect(r.matches.map((m) => m.value)).toContain(again);
    expect(unredact(r.text, vault)).toBe(`Relance ${first} demain`);
  });
});

describe("reconcileMatches — what still fails CLOSED", () => {
  const ctx = (text: string) => ({
    vault: { "Basile Cazenave": "Jean McDonald" },
    exclude: new Set<string>(),
    text,
    uncertainKeys: new Set<string>(),
  });
  const match = (value: string) => ({ type: "secret" as const, value, placeholder: "Basile Cazenave", category: "NAME" });

  it("a casing variant still on the wire is a refusal", () => {
    expect(reconcileMatches([match("Jean Mcdonald")], ctx("Relance Jean Mcdonald")).error).toBe(UNREVERSIBLE_ERROR);
  });

  it("a placeholder restoring ANOTHER entity is a refusal, even once masked", () => {
    expect(reconcileMatches([match("Léa Morvan")], ctx("Relance Basile Cazenave")).error).toBe(UNREVERSIBLE_ERROR);
  });

  it("a placeholder missing from the vault is a refusal", () => {
    const m = { ...match("Jean McDonald"), placeholder: "Inconnu" };
    expect(reconcileMatches([m], ctx("Relance Inconnu")).error).toBe(UNREVERSIBLE_ERROR);
  });
});
