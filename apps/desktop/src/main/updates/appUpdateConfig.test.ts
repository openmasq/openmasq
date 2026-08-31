// The PARITY of the two `app-update.yml` shapes — the build-time home (scripts/, CJS) and the
// runtime reconstruction (appUpdateConfig.ts). Two implementations because two
// runtimes (an electron-builder hook can't be imported from the main bundle); this test is
// what keeps them from drifting apart (rule 9: when two copies can't import each other,
// a test reads BOTH). It also pins the byte-for-byte shape that electron-builder
// generates on the normal path — that's the one the split pipeline must reproduce.
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
    // Captured from a build of the non-split path — the reference both copy.
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
