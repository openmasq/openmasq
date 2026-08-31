import { describe, expect, it } from "vitest";
import { friendlyError } from "./loginErrors";

/**
 * What these cases pin: the login screen never leaves someone stuck
 * in English when the cause is known, and never stays SILENT when it isn't.
 */
describe("friendlyError — ce que l'écran de connexion montre d'un refus", () => {
  it("nomme le cas « inscriptions fermées » — sa cause est l'ADRESSE, pas une panne", () => {
    // GoTrue's two phrasings: instance-level lock, then provider-level lock.
    for (const raw of ["Signups not allowed for this instance", "Email signups are disabled"]) {
      const out = friendlyError(raw);
      expect(out).not.toBe(raw); // never raw English on a French screen again
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
    // The informal "tu" form in two messages clashed with « Connectez-vous », « votre e-mail ».
    for (const raw of ["", "Failed to fetch", "Email rate limit exceeded"]) {
      expect(friendlyError(raw)).not.toMatch(/\b(ta|tu|ton)\b|réessaie\b|Vérifie\b|Patiente\b/);
    }
  });
});
