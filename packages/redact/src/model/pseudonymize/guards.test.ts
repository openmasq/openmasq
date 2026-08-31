import { describe, it, expect } from "vitest";
import { buildAvoidGuard } from "./guards";
import { pseudonymize } from "./index";

describe("buildAvoidGuard — the CURRENT input is part of the collision word set", () => {
  it("rejects a fake reusing an input word in ANY casing", () => {
    // The notarial-deed collision: the real "Maître GERMAIN" sits in the text, a
    // Title-cased fake "Antoine Germain" passed the allocator's case-SENSITIVE
    // `input.includes` and the recase machinery then rendered the collision.
    const collides = buildAvoidGuard({}, {}, "acte reçu par Maître GERMAIN notaire");
    expect(collides("Antoine Germain")).toBe(true);
    expect(collides("germain")).toBe(true);
    expect(collides("Antoine Berthon")).toBe(false);
  });

  it("still honours the caller's avoid blobs and the vault originals", () => {
    const collides = buildAvoidGuard({ avoid: ["on parle d'Amiens ici"] }, { fake1: "Nantes" }, "");
    expect(collides("Amiens")).toBe(true);
    expect(collides("nantes")).toBe(true);
    expect(collides("Bastia")).toBe(false);
  });
});

describe("…et un mot de faux NEUF d'un NOM respecte `avoid` (17/08/2026)", () => {
  /**
   * NAME/EMAIL are exempt from the `avoid` guard on the WHOLE candidate, for a reason
   * that holds: rejecting the canonical fake would split the person into two identities.
   * The exemption did leave a hole though — measured on the contracts bench: a NEW
   * fake word could land on a word already present in the CONVERSATION, and the global
   * vault then re-redacts that word everywhere. That's exactly what `avoid` exists to
   * prevent. The constraint is therefore placed on `mintTaken`, consulted ONLY when picking
   * a new word — never on the reuse of a canonical one.
   */
  const MOTS = ["Chastanet", "Aubertin", "Fressineau", "Sauvestre", "Delsart", "Malbrancq"];

  it("aucun mot de la conversation ne se retrouve dans le faux", async () => {
    const r = await pseudonymize("Le rapport de Camille Cros est prêt.", {
      vault: {},
      avoid: [MOTS.join(" ")],
      detectLocal: () => Promise.resolve([{ value: "Camille Cros", category: "NAME" }]),
    });
    expect(r.text).not.toContain("Camille Cros");
    for (const m of MOTS) expect(r.text).not.toContain(m);
  });

  it("⚠️ et l'identité ne se scinde pas pour autant — c'est la raison de l'exemption", async () => {
    // The canonical fake is NOT subject to the guard: the same person, seen again the
    // next turn, keeps their fake.
    const vault: Record<string, string> = {};
    const opts = {
      avoid: [MOTS.join(" ")],
      detectLocal: () => Promise.resolve([{ value: "Camille Cros", category: "NAME" }]),
    };
    const a = await pseudonymize("Le rapport de Camille Cros est prêt.", { vault, ...opts });
    const b = await pseudonymize("Camille Cros a signé.", { vault, ...opts });
    const fauxA = Object.entries(vault).find(([, v]) => v === "Camille Cros")?.[0];
    expect(fauxA).toBeTruthy();
    expect(a.text).toContain(fauxA!);
    expect(b.text).toContain(fauxA!);
  });
});
