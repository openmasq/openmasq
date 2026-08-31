import { describe, it, expect } from "vitest";
import { opaqueIdsIn, nearestIdentifier, identifierTypoHint } from "./identifierTypo";

// The real case (journal 04/08/2026): `gmail__messages_list` gave back these identifiers,
// the model mis-retyped five of them in the `get_message` calls that followed.
const REELS = [
  "19fcca18e19a1ffa",
  "19fc78f80fd31ba0",
  "19fc77a1a7ca0382",
  "19fc2539c9162219",
  "19fb320f2a870089",
];
const RETAPES = [
  ["19fca18f19a1ffa", "19fcca18e19a1ffa"],
  ["19fc78f80fd31ba", "19fc78f80fd31ba0"],
  ["19fc77a1a7ca038", "19fc77a1a7ca0382"],
  ["19fc2539c916221", "19fc2539c9162219"],
  ["19fb320a870089", "19fb320f2a870089"],
] as const;

describe("nearestIdentifier", () => {
  it("retrouve la bonne valeur pour chacune des cinq fautes réelles", () => {
    for (const [bad, right] of RETAPES) expect(nearestIdentifier(bad, REELS)).toBe(right);
  });

  it("se tait quand l'identifiant existe TEL QUEL — la panne est alors ailleurs", () => {
    // A "not found" on an exact identifier means something else (permissions, deleted
    // message): suggesting a correction would send the model to fix what isn't broken.
    expect(nearestIdentifier("19fc78f80fd31ba0", REELS)).toBeUndefined();
  });

  it("se tait sur une AMBIGUÏTÉ — deux candidats à la même distance", () => {
    // An invented correction costs more than the original error: it's credible.
    expect(nearestIdentifier("19fc2539c9162210", ["19fc2539c9162211", "19fc2539c9162212"])).toBeUndefined();
  });

  it("se tait au-delà de deux éditions — ce n'est plus une recopie mais un autre objet", () => {
    expect(nearestIdentifier("19fc2539c9160000", ["19fc2539c9162219"])).toBeUndefined();
  });

  it("ne touche jamais à un jeton court ni à un mot", () => {
    expect(nearestIdentifier("abc123", ["abd123"])).toBeUndefined();
    expect(nearestIdentifier("informations", ["information"])).toBeUndefined();
  });
});

describe("opaqueIdsIn", () => {
  it("moissonne les identifiants d'un résultat d'outil, sans les mots qui l'entourent", () => {
    const ids = opaqueIdsIn(
      `Lubin <aurele@orange.fr> — « Put AI to work for you » [id: 19fb320f2a870089]\n` +
        `Close Support — « Your Close Trial is Ending » [id: 19fc84baa083b134]`,
    );
    expect(ids).toEqual(["19fb320f2a870089", "19fc84baa083b134"]);
  });
});

describe("identifierTypoHint", () => {
  it("nomme l'argument, la valeur fautive et la bonne", () => {
    const hint = identifierTypoHint({ id: "19fc78f80fd31ba" }, REELS);
    expect(hint).toContain("19fc78f80fd31ba0");
    expect(hint).toContain("`id`");
    expect(hint).toMatch(/caractère par caractère/);
  });

  it("rend une chaîne VIDE quand il n'y a rien de sûr à dire", () => {
    // Nothing safe to append to the result ⇒ the connector's error message stays as-is.
    expect(identifierTypoHint({ id: "19fc78f80fd31ba0" }, REELS)).toBe("");
    expect(identifierTypoHint({ query: "factures 2026" }, REELS)).toBe("");
    expect(identifierTypoHint({ limit: 10 }, REELS)).toBe("");
  });
});
