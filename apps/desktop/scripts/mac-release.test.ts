import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { macArches } from "./mac-release";
import { EB_CONFIG, type EbConfigShape } from "./shippedTriples";

const require = createRequire(import.meta.url);
const realConfig = () => require(EB_CONFIG) as EbConfigShape;

// `mac-release.ts` orchestre des processus (electron-builder, notarytool, stapler) : ce qui
// se teste hors machine, c'est la seule décision qu'il prend lui-même — QUELLES arches il
// traite. Le reste se relit par `OPENMASQ_MAC_RELEASE_DRY_RUN=1`, qui imprime le plan complet
// sans rien exécuter.
describe("mac-release — les arches viennent d'electron-builder.cjs", () => {
  it("ne recopie aucune liste : elle est lue dans la config qui la décide", () => {
    const arches = macArches(realConfig());
    expect(arches).toEqual(["arm64", "x64"]);
  });

  it("suit la config quand elle change, sans édition ici", () => {
    const config: EbConfigShape = { mac: { target: [{ target: "dmg", arch: ["arm64"] }] }, win: {} };
    expect(macArches(config)).toEqual(["arm64"]);
  });

  // ⚠️ L'ORDRE compte, et c'est pour ça qu'il est épinglé. La première arche traitée sert de
  // BASE à la fusion des manifestes : c'est son `path:`/`sha512:` de tête — les champs
  // hérités qu'un très vieux client lirait faute de savoir filtrer par arche — qui ressort.
  // Le bloc `files:`, lui, est identique quel que soit l'ordre.
  it("traite l'arm64 en premier (la base du manifeste fusionné)", () => {
    expect(macArches(realConfig())[0]).toBe("arm64");
  });

  // Échec FERMÉ, hérité de `shippedTriples` : « aucune arche » n'est jamais une vérité utile.
  // Une forme de config devenue méconnaissable doit arrêter la release, pas produire une
  // boucle qui ne notarise rien et se termine en vert.
  it("refuse un electron-builder.cjs dont la forme a changé", () => {
    expect(() => macArches({ mac: { target: [] }, win: {} })).toThrow(/aucune .*arch/i);
  });

  it("le script est bien là où le workflow l'appelle", () => {
    expect(() => readFileSync(join(EB_CONFIG, "..", "scripts", "mac-release.ts"), "utf8")).not.toThrow();
  });
});
