import { describe, expect, it } from "vitest";
import { redactNumbersOn } from "./redactNumbers";

describe("redactNumbersOn — un réglage sans interrupteur ne doit pas rester actif", () => {
  it("répond NON, même pour un compte qui l'avait activé", () => {
    // That's the whole point of this function: the toggle has disappeared from the screen, but the
    // field survives in already-persisted blobs. Without neutralization, this account
    // would keep tokenizing every number indefinitely with no way to turn it off.
    expect(redactNumbersOn({ redactNumbers: true })).toBe(false);
    expect(redactNumbersOn({ redactNumbers: false })).toBe(false);
    expect(redactNumbersOn(undefined)).toBe(false);
  });
});
