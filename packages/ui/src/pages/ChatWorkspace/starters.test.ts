import { describe, it, expect } from "vitest";
import { redact } from "@openmasq/redact";
import { getMessages } from "@openmasq/i18n";
import { pickStarters, starterCopy, UNIVERSAL_STARTERS } from "./starters";

describe("pickStarters — l'accueil ne propose que ce qui marche sans rien connecter", () => {
  it("les quatre amorces, sans aucune offre d'intégration", () => {
    // The home screen once offered Gmail, Drive, Agenda… that a new user could not use.
    // A starter carries no connector any more: nothing here can lead to a connection.
    const picked = pickStarters();
    expect(picked.map((s) => s.id)).toEqual(UNIVERSAL_STARTERS.map((s) => s.id));
    for (const s of picked) expect(Object.keys(s)).toEqual(["id"]);
  });

  it("Mémoire fermée : l'amorce « Retiens que… » disparaît", () => {
    expect(pickStarters({ memoryOpen: false }).map((s) => s.id)).not.toContain("memory");
  });

  it("des ids stables et uniques (clés React et table d'icônes)", () => {
    const ids = UNIVERSAL_STARTERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("amorces universelles — elles MONTRENT le masquage", () => {
  // Their whole point: the card sends data the engine masks before it leaves. A demo
  // whose IBAN fails its checksum, or whose e-mail no longer parses, would show nothing.
  for (const locale of ["fr", "en"] as const) {
    it(`${locale} : chaque démonstrateur porte des données que le moteur déterministe masque`, () => {
      const t = getMessages(locale);
      for (const s of UNIVERSAL_STARTERS.filter((s) => s.id !== "memory")) {
        const types = redact(starterCopy(s, t).prompt).matches.map((m) => m.type);
        expect(types.length, `${locale}/${s.id}`).toBeGreaterThan(0);
      }
    });
  }
});
