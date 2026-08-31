import { describe, it, expect, beforeEach } from "vitest";
import { attachmentVault, forgetAttachmentVault } from "./attachmentVault";

/**
 * The invariant this module makes possible: TWO attachments in the same conversation
 * share one vault, so the same person only ever gets ONE fake in it. Measured broken on
 * 15/08/2026 on two real documents (Kbis + letter of intent) — the model concluded
 * they referred to different people.
 */
describe("coffre de travail des pièces jointes", () => {
  beforeEach(() => {
    for (const id of ["c1", "c2", "brouillon"]) forgetAttachmentVault(id);
  });

  it("deux pièces de la MÊME conversation partagent le même objet", () => {
    const a = attachmentVault("c1");
    const b = attachmentVault("c1");
    expect(b).toBe(a); // same reference: what the 1st document allocates, the 2nd sees
    a["Anselme Sauvestre"] = "Sabourdin Julien";
    expect(attachmentVault("c1")["Anselme Sauvestre"]).toBe("Sabourdin Julien");
  });

  it("deux CONVERSATIONS ne partagent rien", () => {
    attachmentVault("c1")["X"] = "réel-1";
    expect(attachmentVault("c2")["X"]).toBeUndefined();
  });

  it("s'amorce du coffre PERSISTÉ, et une seule fois", () => {
    const v = attachmentVault("c1", { "Faux Ancien": "Réel Ancien" });
    expect(v["Faux Ancien"]).toBe("Réel Ancien");
    v["Faux Neuf"] = "Réel Neuf";
    // A later seed must not overwrite what the turn has already assigned.
    const again = attachmentVault("c1", { "Faux Ancien": "AUTRE" });
    expect(again["Faux Neuf"]).toBe("Réel Neuf");
    expect(again["Faux Ancien"]).toBe("Réel Ancien");
  });

  it("ne recopie PAS l'amorce : muter le coffre de travail ne touche pas le persisté", () => {
    const persiste = { "Faux A": "Réel A" };
    const travail = attachmentVault("c1", persiste);
    travail["Faux B"] = "Réel B";
    expect(persiste["Faux B" as keyof typeof persiste]).toBeUndefined();
  });

  it("borné : une session longue n'accumule pas indéfiniment", () => {
    const premier = attachmentVault("conv-0");
    premier["marqueur"] = "présent";
    for (let i = 1; i <= 30; i++) attachmentVault(`conv-${i}`);
    // The oldest one was evicted — we start fresh cleanly, never on the same object.
    expect(attachmentVault("conv-0")["marqueur"]).toBeUndefined();
  });
});
