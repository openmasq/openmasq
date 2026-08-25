import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";

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
});
