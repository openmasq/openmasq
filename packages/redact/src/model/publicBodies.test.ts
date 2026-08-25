import { describe, it, expect } from "vitest";
import { isPublicBodyCompound } from "./publicBodies";
import { isNonPiiTerm } from "./genericTerms";

describe("isPublicBodyCompound — l'administration AVEC son suffixe territorial", () => {
  /** ⚠️ RÉGRESSION mesurée : le sigle nu était déjà épargné, le composé partait au coffre.
   *  `isGenericCompound` exige que TOUS les mots soient couverts, et un nom de département
   *  ne l'est jamais — toute la famille s'échappait, une antenne à la fois. */
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

  /** LA limite, et elle vient de l'audit d'annotation : un établissement RATTACHÉ à une
   *  personne nommée (l'école de l'élève, le laboratoire du patient) est une donnée
   *  personnelle — il est annoté comme telle dans les corpus. La généralisation
   *  « mot institutionnel + lieu » l'aurait épargné ; cette liste ne le fait pas. */
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
