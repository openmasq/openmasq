import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../model/pseudonymize";
import { unredact } from "../../index";
import type { Vault } from "../../types";

/**
 * L'ANCRAGE PAR VILLE — une ville réelle reçoit UN lieu faux, partout.
 *
 * ⚠️ RÉGRESSION mesurée par `bench/tokensVsFakes.md` (« le défaut le plus coûteux que ce
 * banc ait trouvé ») : la même ville écrite dans deux adresses distinctes recevait deux
 * lieux faux différents — « ces deux adresses sont-elles dans la même région ? » basculait
 * de oui à non, et la réponse restituée restait fausse (une dérivation n'est pas une clé de
 * coffre). Ces tests pinnent la cohérence sur les trois axes : entre deux blocs, entre deux
 * adresses en prose, et d'un ENVOI à l'autre via le coffre.
 */

/** La ville fausse servie pour une valeur réelle du coffre (fake → real inversé). */
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
    // TOUTES les occurrences fausses de la ville sont identiques : « même région ? »
    // ne peut plus basculer.
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
    // Une ville nue en prose relève du NER, pas du pipeline déterministe — stub injecté,
    // comme le produit le fait (`detectLocal`).
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
    // Chaque faux ne sert qu'UNE valeur réelle — l'anti-collision de l'ancre.
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
    // Second envoi, MÊME coffre, une adresse NOUVELLE (valeur différente) dans la même ville.
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
