// La PARITÉ des deux formes d'`app-update.yml` — la maison de build (scripts/, CJS) et la
// reconstruction à l'exécution (appUpdateConfig.ts). Deux implémentations parce que deux
// runtimes (un hook electron-builder ne s'importe pas depuis le bundle main) ; ce test est
// ce qui les empêche de dériver (règle 9 : quand deux copies ne peuvent pas s'importer,
// un test lit les DEUX). Il épingle aussi l'octet près la forme qu'electron-builder
// génère sur le chemin normal — c'est elle que le pipeline scindé doit reproduire.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { rebuiltUpdateConfigContent } from "./updateConfigContent";
import { BRAND } from "@openmasq/branding";

const requireHere = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { appUpdateYmlContent } = requireHere("../../../scripts/appUpdateYml.cjs") as {
  appUpdateYmlContent: (publish: unknown, productFilename: string) => string;
};

const URL = `https://updates.${BRAND.domain}/desktop/desktop-production`;

describe("app-update.yml — parité build ⇄ exécution", () => {
  it("les deux implémentations produisent le même fichier", () => {
    const build = appUpdateYmlContent({ provider: "generic", url: URL, channel: "latest" }, BRAND.name);
    const runtime = rebuiltUpdateConfigContent(URL, "latest", BRAND.name);
    expect(runtime).toBe(build);
  });

  it("reproduit l'octet près la forme d'electron-builder (le chemin normal)", () => {
    // Relevé sur un build du chemin non scindé — la référence que les deux copient.
    expect(appUpdateYmlContent({ provider: "generic", url: URL, channel: "latest" }, BRAND.name)).toBe(
      "provider: generic\n" +
        `url: ${URL}\n` +
        "channel: latest\n" +
        `updaterCacheDirName: ${BRAND.slug}-updater\n`,
    );
  });

  it("accepte la forme LISTE de publish et un channel absent", () => {
    const out = appUpdateYmlContent([{ provider: "generic", url: URL }], BRAND.name);
    expect(out).toContain("channel: latest");
  });

  it("refuse une config publish qu'il ne sait pas décrire — jamais un feed inventé", () => {
    expect(() => appUpdateYmlContent(undefined, BRAND.name)).toThrow(/publish/);
    expect(() => appUpdateYmlContent({ provider: "s3" }, BRAND.name)).toThrow(/publish/);
  });
});
