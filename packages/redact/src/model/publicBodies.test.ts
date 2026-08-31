import { describe, it, expect } from "vitest";
import { isPublicBodyCompound } from "./publicBodies";
import { isNonPiiTerm } from "./genericTerms";

describe("isPublicBodyCompound — l'administration AVEC son suffixe territorial", () => {
  /** ⚠️ Measured REGRESSION: the bare acronym was already spared, the compound went to the vault.
   *  `isGenericCompound` requires ALL words to be covered, and a department name
   *  never is — the whole family escaped, one branch at a time. */
  it("épargne le composé que la liste plate ne peut pas atteindre", () => {
    for (const v of [
      "URSSAF ÎLE-DE-FRANCE",
      "CAISSE D'ALLOCATIONS FAMILIALES DU RHÔNE",
      "SIP NANTES CENTRE",
      "TRIBUNAL JUDICIAIRE DE NANTERRE",
      "Direction générale des finances publiques de la Gironde",
      "Mairie de Vernon",
    ]) expect(isPublicBodyCompound(v), v).toBe(true);
  });

  /** THE limit, and it comes from the annotation audit: an establishment ATTACHED to a
   *  named person (the student's school, the patient's lab) is personal
   *  data — it's annotated as such in the corpora. The generalisation
   *  « institutional word + place » would have spared it; this list does not. */
  it("ne touche PAS l'établissement rattaché à une personne", () => {
    for (const v of [
      "COLLÈGE JEAN-BAPTISTE CARPEAUX",
      "LABORATOIRE BIOMÉRIDIEN",
      "Académie de Lille",
      "UNIVERSITÉ DE FRANCHE-COMTÉ",
      "Banque du Centre",
      "ST BRENDAN'S GENERAL HOSPITAL",
    ]) expect(isPublicBodyCompound(v), v).toBe(false);
  });

  it("un CHIFFRE dans la valeur la disqualifie — c'est un numéro, pas un office", () => {
    expect(isPublicBodyCompound("URSSAF 117 0001234567")).toBe(false);
    expect(isPublicBodyCompound("CAF 0 456 789 K")).toBe(false);
  });

  it("le sigle NU relève de la liste plate, pas d'ici ; une phrase longue est refusée", () => {
    expect(isPublicBodyCompound("URSSAF")).toBe(false);
    expect(isPublicBodyCompound("mairie de la petite commune située au bord de la rivière")).toBe(false);
  });

  it("passe bien par le point de passage partagé", () => {
    expect(isNonPiiTerm("URSSAF ÎLE-DE-FRANCE")).toBe(true);
    expect(isNonPiiTerm("COLLÈGE JEAN-BAPTISTE CARPEAUX")).toBe(false);
  });
});
