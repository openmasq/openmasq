import { describe, expect, it } from "vitest";
import { redactNumbersOn } from "./redactNumbers";

describe("redactNumbersOn — un réglage sans interrupteur ne doit pas rester actif", () => {
  it("répond NON, même pour un compte qui l'avait activé", () => {
    // C'est tout l'objet de cette fonction : la bascule a disparu de l'écran, mais le
    // champ survit dans les blobs déjà persistés. Sans neutralisation, ce compte
    // jetoniserait chaque nombre indéfiniment sans aucun moyen de l'éteindre.
    expect(redactNumbersOn({ redactNumbers: true })).toBe(false);
    expect(redactNumbersOn({ redactNumbers: false })).toBe(false);
    expect(redactNumbersOn(undefined)).toBe(false);
  });
});
