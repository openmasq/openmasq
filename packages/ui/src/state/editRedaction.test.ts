import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import { redactEditedText } from "./editRedaction";

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  title: "t",
  modelId: "m",
  messages: [],
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

describe("redactEditedText — la passe de redaction à la SAUVEGARDE d'une édition", () => {
  it("une PII tapée dans l'éditeur entre au vault (le wire du tour suivant la rejouera)", async () => {
    const patch = await redactEditedText(
      conv(),
      "Contacter marceline.brivet@exemple.fr au +33 6 12 34 56 78.",
      [],
    );
    const reals = Object.values(patch.redactionVault ?? {});
    expect(reals).toContain("marceline.brivet@exemple.fr");
    expect(patch.redactionKinds?.["marceline.brivet@exemple.fr"]).toBe("email");
    expect(patch.redactionSalt).toBeGreaterThan(0);
  });

  it("ÉTEND le vault existant sans re-frapper les valeurs déjà redacted", async () => {
    const existing = {
      redactionVault: { "fake@x.fr": "deja.la@exemple.fr" },
      redactionKinds: { "deja.la@exemple.fr": "email" },
      redactionSalt: 42,
    };
    const patch = await redactEditedText(
      conv(existing),
      "Écrire à deja.la@exemple.fr et à nouveau.venu@exemple.fr.",
      [],
    );
    const vault = patch.redactionVault ?? {};
    // L'entrée existante est conservée telle quelle (même fake), la nouvelle s'ajoute.
    expect(vault["fake@x.fr"]).toBe("deja.la@exemple.fr");
    expect(Object.values(vault).filter((v) => v === "deja.la@exemple.fr")).toHaveLength(1);
    expect(Object.values(vault)).toContain("nouveau.venu@exemple.fr");
    expect(patch.redactionSalt).toBe(42); // le salt de la conversation est réutilisé
  });

  it("respecte les catégories désactivées", async () => {
    const patch = await redactEditedText(conv(), "Contact : jean@exemple.fr", ["email"]);
    expect(Object.values(patch.redactionVault ?? {})).not.toContain("jean@exemple.fr");
  });
});
