import { describe, expect, it } from "vitest";
import { pseudonymize } from "./index";

/**
 * Le même défaut que `engine/contextFields.test.ts` épingle au niveau du DÉTECTEUR, mais vu
 * d'où il comptait : le FIL. Un champ étiqueté NOM avalait la valeur du champ voisin, et
 * cette valeur — téléphone, date de naissance, e-mail — partait EN CLAIR au modèle,
 * transportée à l'intérieur du faux (la clé de coffre était littéralement
 * `"Aurèle Aubertin (06 12 34 56 78)"`).
 *
 * Ces cas restent ici parce que la coupe ne suffit pas : il faut aussi que le voisin, une
 * fois libéré, soit RÉELLEMENT attrapé par son propre détecteur et vaulté. Un test de
 * détecteur ne peut pas le dire.
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
    // ⚠️ Le cas au tiret partait en `julien@exemple.hennequin` : le domaine de tête faisait
    // illusion de redaction alors que la partie locale ET le domaine étaient en clair.
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
