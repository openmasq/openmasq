// Ce que l'app.asar a le droit de contenir. Les cas ci-dessous ne sont pas inventés : ce
// sont les entrées qu'un app.asar ramasse quand l'allowlist d'electron-builder
// avait cessé de s'appliquer sans que rien ne rougisse.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { findPackagingViolations, assertPackagedContents, ALLOWED_ROOTS } = require("./packageContents.cjs");

/** Ce qu'une app SAINE contient — et rien d'autre. */
const SAIN = [
  "/out",
  "/out/main/index.js",
  "/out/main/chunks/documents-Bej6Jle8.js",
  "/out/preload/index.js",
  "/out/renderer/assets/index-abc123.js",
  "/package.json",
  "/node_modules",
  "/node_modules/electron-updater/out/main.js",
  "/node_modules/@libsql/darwin-arm64/index.node",
];

describe("findPackagingViolations", () => {
  it("laisse passer une app saine", () => {
    expect(findPackagingViolations(SAIN)).toEqual([]);
  });

  it("refuse le TypeScript d'origine, les tests et l'outillage", () => {
    const fuite = ["/src/main/index.ts", "/e2e/helpers.ts", "/scripts/afterPack.cjs", "/native/win-jail/main.c"];
    const trouvees = findPackagingViolations([...SAIN, ...fuite]).map((v: { entry: string }) => v.entry);
    expect(trouvees).toEqual(fuite.map((f) => f.slice(1)));
  });

  it("refuse les .env — un fichier d'environnement n'a rien à faire dans l'app", () => {
    for (const env of ["/.env", "/.env.local", "/.env.development", "/.env.development.local"]) {
      expect(findPackagingViolations([env])).toHaveLength(1);
    }
  });

  it("refuse les sourcemaps de NOS bundles, à l'intérieur même de out/", () => {
    const v = findPackagingViolations(["/out/main/index.js.map", "/out/preload/index.js.map"]);
    expect(v).toHaveLength(2);
    expect(v[0].why).toMatch(/sourcesContent/);
  });

  it("laisse les .map des dépendances vendorées — elles décrivent du code déjà public", () => {
    expect(findPackagingViolations(["/node_modules/ajv/dist/core.js.map"])).toEqual([]);
  });

  it("est une ALLOWLIST : un dossier NOUVEAU est refusé sans qu'on l'ait nommé", () => {
    // Le point de tout le fichier : une denylist aurait laissé passer celui-là.
    const v = findPackagingViolations(["/un-dossier-qui-n-existe-pas-encore/secret.txt"]);
    expect(v).toHaveLength(1);
    expect(ALLOWED_ROOTS).not.toContain("un-dossier-qui-n-existe-pas-encore");
  });
});

describe("assertPackagedContents", () => {
  it("ne dit rien sur une app saine", () => {
    expect(() => assertPackagedContents(SAIN)).not.toThrow();
  });

  it("casse le build et nomme la cause connue", () => {
    expect(() => assertPackagedContents(["/src/main/index.ts"])).toThrow(/filter:/);
  });

  it("groupe au lieu de dérouler des centaines de lignes", () => {
    const beaucoup = Array.from({ length: 400 }, (_, i) => `/src/fichier${i}.ts`);
    const message = (() => {
      try {
        assertPackagedContents(beaucoup);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(message).toMatch(/400 entrée\(s\)/);
    expect(message.split("\n").length).toBeLessThan(15);
  });
});
