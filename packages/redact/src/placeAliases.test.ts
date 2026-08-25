import { describe, it, expect } from "vitest";
import { pseudonymize, unredact } from "./index";
import { placeAliases } from "./model/identity/place";

/* Régression sur une attestation notariale réelle.

   Le coffre portait « LORIENT (56100) → ST OUEN (93400) » — ville et code postal dans UNE
   clé, volontairement, pour que le faux code reste cohérent avec la fausse ville. Mais le
   modèle écrit la ville seule (« le bien est situé à Lorient »), un fragment n'est pas une
   clé, et la restitution le laissait tel quel. L'utilisateur a donc lu, dans sa propre
   analyse, que le bien était à Lorient. Il est à Saint-Ouen.

   ⚠️ C'est la panne SYMÉTRIQUE d'une fuite : rien de réel n'est sorti, mais un fait inventé
   est rentré comme s'il était le sien, sans le moindre signal. Un faux qui ne sait pas
   revenir n'est pas une protection, c'est un mensonge. */

describe("place composite — la ville seule doit revenir", () => {
  it("restitue la ville et le code postal cités séparément", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Un bien sis à ST OUEN (93400) 31 rue Villa Ancelle.", { vault });
    const composite = Object.keys(vault).find((k) => /\(\d{5}\)/.test(k));
    expect(composite, "le détecteur géo doit produire le composite ville+code").toBeTruthy();
    const fakeTown = composite!.split(" (")[0];
    const fakeCode = /\((\d+)\)/.exec(composite!)![1];
    const titled = fakeTown.charAt(0) + fakeTown.slice(1).toLowerCase();

    // Comme le modèle l'écrit réellement : la ville seule, en casse de phrase.
    expect(unredact(`Le bien est situé à ${titled}.`, vault)).toMatch(/ouen/i);
    // Et le code postal seul, qu'un modèle recopie volontiers dans un tableau.
    expect(unredact(`Code postal ${fakeCode}.`, vault)).toContain("93400");
    // La forme entière continue évidemment de revenir.
    expect(unredact(`Situé à ${composite}.`, vault)).toContain("ST OUEN (93400)");
  });

  it("n'aligne QUE des décompositions identiques — sinon aucun alias", () => {
    // Un alias mal aligné ferait pointer un fragment vers la MAUVAISE valeur réelle, ce qui
    // est bien pire que de ne pas restituer : on préfère ne rien émettre.
    expect(placeAliases("ST OUEN (93400)", "LORIENT")).toEqual([]);
    expect(placeAliases("ST OUEN", "LORIENT (56100)")).toEqual([]);
    expect(placeAliases("une phrase sans code", "une autre phrase")).toEqual([]);
  });

  it("couvre les trois formes qu'une adresse française prend", () => {
    const paren = placeAliases("ST OUEN (93400)", "LORIENT (56100)");
    const prefix = placeAliases("93400 ST OUEN", "56100 LORIENT");
    const suffix = placeAliases("ST OUEN 93400", "LORIENT 56100");
    for (const [nom, pairs] of [["(code)", paren], ["code ville", prefix], ["ville code", suffix]] as const) {
      const map = new Map(pairs);
      expect(map.get("56100"), nom).toBe("93400");
      expect(map.get("LORIENT"), nom).toBe("ST OUEN");
      expect(map.get("Lorient"), nom).toBe("St Ouen");
    }
  });

  it("répare un coffre DÉJÀ écrit — sans le réécrire", () => {
    // Le coffre exact du journal : seulement le composite, aucun alias de fragment.
    // Les conversations existantes doivent guérir sans migration ni réécriture.
    const ancien = {
      "LORIENT (56100)": "ST OUEN (93400)",
      ANTOINE: "BELMADANI",
      CLARA: "SABOURDIN",
    };
    const copie = { ...ancien };
    const out = unredact(
      "Un bien immobilier situé à Lorient, promesse entre M. SABOURDIN et M. BELMADANI.",
      ancien,
    );
    expect(out).toContain("St Ouen");
    // La dérivation est en LECTURE : le coffre stocké ne bouge pas.
    expect(ancien).toEqual(copie);
  });

  it("une entrée EXISTANTE l'emporte toujours sur une dérivation", () => {
    const vault = { "LORIENT (56100)": "ST OUEN (93400)", LORIENT: "VANNES" };
    expect(unredact("à LORIENT", vault)).toContain("VANNES");
  });

  it("n'émet pas d'alias identité quand le faux a gardé la vraie part", () => {
    // Aliaser une valeur vers elle-même encombrerait le coffre à vie sans rien restituer.
    expect(placeAliases("ST OUEN (93400)", "LORIENT (93400)").some(([k]) => k === "93400")).toBe(false);
  });
});
