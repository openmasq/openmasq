// La liste des arches expédiées a trois lecteurs (le bake, la CI, l'empaquetage) et une seule
// maison : `electron-builder.cjs`. Ce fichier pince les deux bouts — l'analyse, et ce que la
// VRAIE config dit aujourd'hui.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { EB_CONFIG, currentBlock, shippedTriples, type EbConfigShape } from "./shippedTriples";

const require = createRequire(import.meta.url);

const CONFIG: EbConfigShape = {
  directories: { output: "release" },
  mac: {
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: { oneClick: true },
};

describe("shippedTriples", () => {
  it("préfixe chaque arche de l'OS de son bloc", () => {
    expect(shippedTriples("mac", CONFIG)).toEqual(["darwin-arm64", "darwin-x64"]);
    expect(shippedTriples("win", CONFIG)).toEqual(["win32-x64"]);
  });

  it("dédoublonne : dmg et zip répètent la même liste, ce n'est pas deux bakes", () => {
    expect(shippedTriples("mac", CONFIG)).toHaveLength(2);
  });

  it("ne mélange pas les blocs : chaque plateforme ne rend que SES arches", () => {
    expect(shippedTriples("mac", CONFIG)).not.toContain("darwin-nsis");
    expect(shippedTriples("win", CONFIG)).not.toContain("win32-arm64");
  });

  // ÉCHEC FERMÉ : « aucune arche » ferait un bake qui ne bake rien, et donc un empaquetage
  // qui réclame un dossier absent — très loin de la cause.
  it("refuse une config dont la forme a changé au lieu de rendre une liste vide", () => {
    expect(() => shippedTriples("mac", { mac: { target: [] }, win: {} })).toThrow(
      /forme d'electron-builder/,
    );
    expect(() => shippedTriples("mac", { mac: {} })).toThrow(/forme d'electron-builder/);
  });

  it("refuse un bloc de plateforme absent de la config", () => {
    expect(() => shippedTriples("linux", CONFIG)).toThrow(/aucun bloc/);
  });

  it("refuse un bloc de plateforme inconnu", () => {
    expect(() => shippedTriples("bsd", CONFIG)).toThrow(/bloc de plateforme inconnu/);
  });

  it("mappe la machine courante sur son bloc", () => {
    expect(currentBlock("darwin")).toBe("mac");
    expect(currentBlock("win32")).toBe("win");
    expect(() => currentBlock("aix" as NodeJS.Platform)).toThrow(/non empaquetée/);
  });
});

describe("le VRAI electron-builder.cjs", () => {
  it("expédie les deux arches mac — Intel compris", () => {
    expect(shippedTriples("mac", require(EB_CONFIG) as EbConfigShape)).toEqual([
      "darwin-arm64",
      "darwin-x64",
    ]);
  });

  it("n'expédie encore que le x64 sur Windows (aucun prebuilt @libsql win32-arm64)", () => {
    expect(shippedTriples("win", require(EB_CONFIG) as EbConfigShape)).toEqual(["win32-x64"]);
  });
});
