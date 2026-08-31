import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../model/pseudonymize";
import { unredact } from "../../index";
import type { Vault } from "../../types";

/**
 * CITY ANCHORING — a real city gets ONE fake place, everywhere.
 *
 * ⚠️ REGRESSION measured by `bench/tokensVsFakes.md` (« the most costly defect this
 * bench ever found »): the same city written in two distinct addresses used to get two
 * different fake places — « are these two addresses in the same region? » flipped
 * from yes to no, and the restored answer stayed wrong (a derivation is not a vault
 * key). These tests pin coherence on all three axes: between two blocks, between two
 * prose addresses, and from one SEND to the next via the vault.
 */

/** The fake city served for a real vault value (fake → real inverted). */
function fakeCityFor(vault: Vault, realNeedle: string): string | undefined {
  const hit = Object.entries(vault).find(([, real]) => real.includes(realNeedle));
  return hit?.[0].match(/\d{5}\s+([\p{L}\s'’-]+?)(?:\s+CEDEX.*)?$/u)?.[1]?.trim() ?? hit?.[0];
}

describe("cohérence géo inter-blocs — la même ville, le même faux", () => {
  it("deux blocs d'adresse nommant la même ville reçoivent le MÊME lieu faux", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(
      "Bailleur : demeurant 14 cours de l'Intendance, 33000 Bordeaux.\n\n\n\n" +
        "─".repeat(220) +
        "\n\n\n\nPreneur : domicilié 5 rue du Loup, 33000 Bordeaux.",
      { vault },
    );
    expect(text).not.toMatch(/Bordeaux/i);
    // ALL fake occurrences of the city are identical: « same region? »
    // can no longer flip.
    const cities = [...text.matchAll(/\d{5}\s+([\p{L}'’-]+)/gu)].map((m) => m[1].toLowerCase());
    expect(cities.length).toBeGreaterThanOrEqual(2);
    expect(new Set(cities).size).toBe(1);
  });

  it("deux adresses PROSE différentes dans la même ville → la même ville fausse", async () => {
    const vault: Vault = {};
    await pseudonymize(
      "L'acte est signé au 14 cours de l'Intendance, 33000 Bordeaux, puis notifié " +
        "au 5 rue du Loup, 33000 Bordeaux.",
      { vault },
    );
    const a = fakeCityFor(vault, "Intendance");
    const b = fakeCityFor(vault, "Loup");
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("deux villes réelles DISTINCTES gardent deux faux DISTINCTS (réversibilité)", async () => {
    const vault: Vault = {};
    // A bare city in prose is the NER's job, not the deterministic pipeline — stub injected,
    // as the product does it (`detectLocal`).
    const { text } = await pseudonymize(
      "Né à Bordeaux, il vit à Toulouse. Le dossier mentionne Bordeaux puis Toulouse.",
      {
        vault,
        detectLocal: async () => [
          { value: "Bordeaux", category: "CITY" },
          { value: "Toulouse", category: "CITY" },
        ],
      },
    );
    const reals = Object.values(vault).map((v) => v.toLowerCase());
    expect(reals).toContain("bordeaux");
    expect(reals).toContain("toulouse");
    // Each fake serves only ONE real value — the anchor's anti-collision.
    const fakes = Object.keys(vault).map((f) => f.toLowerCase());
    expect(new Set(fakes).size).toBe(fakes.length);
    expect(text).not.toMatch(/bordeaux|toulouse/i);
  });

  it("d'un ENVOI à l'autre : le coffre sème l'ancre, la ville garde son faux", async () => {
    const vault: Vault = {};
    await pseudonymize("Elle habite à Bordeaux.", {
      vault,
      detectLocal: async () => [{ value: "Bordeaux", category: "CITY" }],
    });
    const first = fakeCityFor(vault, "Bordeaux");
    expect(first).toBeDefined();
    // Second send, SAME vault, a NEW address (different value) in the same city.
    const { text } = await pseudonymize(
      "Livraison au 9 quai des Chartrons, 33000 Bordeaux.",
      { vault },
    );
    expect(text.toLowerCase()).toContain(first!.toLowerCase());
  });

  it("la restitution ramène chaque adresse à l'identique", async () => {
    const vault: Vault = {};
    const input =
      "Siège : 14 cours de l'Intendance, 33000 Bordeaux. Entrepôt : 5 rue du Loup, 33000 Bordeaux.";
    const { text } = await pseudonymize(input, { vault });
    expect(unredact(text, vault)).toBe(input);
  });
});
