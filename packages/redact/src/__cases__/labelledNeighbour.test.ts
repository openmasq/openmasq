import { describe, expect, it } from "vitest";
import { pseudonymize } from "../index";

/**
 * The same bug that `engine/contextFields.test.ts` pins at the DETECTOR level, but seen
 * from where it actually mattered: the WIRE. A field labeled NAME swallowed the neighbouring
 * field's value, and that value — phone, birth date, e-mail — went OUT IN CLEAR to the model,
 * carried inside the fake (the vault key was literally
 * `"Aurèle Aubertin (06 12 34 56 78)"`).
 *
 * These cases stay here because the cut alone isn't enough: the neighbour, once
 * freed, must also be ACTUALLY caught by its own detector and vaulted. A detector
 * test can't tell you that.
 */
const wire = async (t: string) => (await pseudonymize(t, { vault: {} })).text;

describe("FUITE — la valeur voisine d'un champ NOM (16/08/2026)", () => {
  it("le téléphone est redacted, pas transporté dans le faux", async () => {
    expect(await wire("Contact : Julien Sabourdin (06 12 34 56 78)")).not.toContain("06 12 34 56 78");
  });

  it("la date de naissance aussi", async () => {
    expect(await wire("Gérant : Julien Sabourdin (né le 12/03/1984)")).not.toContain("12/03/1984");
  });

  it("…et l'e-mail, quel que soit le séparateur", async () => {
    // ⚠️ The dash case went out as `julien@exemple.hennequin`: the leading domain gave the
    // illusion of redaction while both the local part AND the domain were in clear.
    for (const sep of ["(", "- ", ""]) {
      const out = await wire(`Contact : Julien Sabourdin ${sep}julien@exemple.fr`);
      expect(out).not.toContain("julien@exemple");
    }
  });

  it("un voisin sans PII ne casse rien — le nom reste redacted", async () => {
    const out = await wire("Nom : REBOUR Jean, IBAN FR7630006000011234567890189");
    expect(out).not.toContain("REBOUR");
    expect(out).not.toContain("FR7630006000011234567890189");
  });
});
