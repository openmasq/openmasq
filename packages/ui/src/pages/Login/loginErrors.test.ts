import { describe, expect, it } from "vitest";
import { friendlyError } from "./loginErrors";

/**
 * Ce que ces cas tiennent : l'écran de connexion ne renvoie jamais quelqu'un dans le mur
 * en anglais quand la cause est connue, et ne se TAIT jamais quand elle ne l'est pas.
 */
describe("friendlyError — ce que l'écran de connexion montre d'un refus", () => {
  it("nomme le cas « inscriptions fermées » — sa cause est l'ADRESSE, pas une panne", () => {
    // Les deux formulations de GoTrue : verrou d'instance, puis verrou du fournisseur.
    for (const raw of ["Signups not allowed for this instance", "Email signups are disabled"]) {
      const out = friendlyError(raw);
      expect(out).not.toBe(raw); // plus jamais l'anglais brut sur un écran français
      expect(out).toMatch(/adresse/i);
      expect(out).toMatch(/inscriptions sont fermées/i);
    }
  });

  it("garde ses cas réseau et rate-limit", () => {
    expect(friendlyError("Failed to fetch")).toMatch(/Réseau indisponible/);
    expect(friendlyError("Email rate limit exceeded")).toMatch(/Trop de tentatives/);
  });

  it("un message INCONNU passe tel quel — se taire donnerait un formulaire qui « ne fait rien »", () => {
    expect(friendlyError("Some brand new server complaint")).toBe("Some brand new server complaint");
  });

  it("un objet illisible devient une phrase, jamais « [object Object] »", () => {
    expect(friendlyError({} as unknown)).toMatch(/Impossible pour le moment/);
    expect(friendlyError("[object Object]")).toMatch(/Impossible pour le moment/);
    expect(friendlyError('{"code":500}')).toMatch(/Impossible pour le moment/);
    expect(friendlyError("")).toMatch(/Impossible pour le moment/);
  });

  it("vouvoie, comme tout le reste de l'écran", () => {
    // Le tutoiement de deux messages détonnait avec « Connectez-vous », « votre e-mail ».
    for (const raw of ["", "Failed to fetch", "Email rate limit exceeded"]) {
      expect(friendlyError(raw)).not.toMatch(/\b(ta|tu|ton)\b|réessaie\b|Vérifie\b|Patiente\b/);
    }
  });
});
