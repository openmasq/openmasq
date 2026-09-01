import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { macArches } from "./mac-release";
import { EB_CONFIG, type EbConfigShape } from "./shippedTriples";

const require = createRequire(import.meta.url);
const realConfig = () => require(EB_CONFIG) as EbConfigShape;

// `mac-release.ts` orchestrates processes (electron-builder, notarytool, stapler): what
// can be tested off-machine is the one decision it makes itself — WHICH arches it
// processes. The rest is reviewed via `OPENMASQ_MAC_RELEASE_DRY_RUN=1`, which prints the full plan
// without running anything.
describe("mac-release — les arches viennent d'electron-builder.cjs", () => {
  it("ne recopie aucune liste : elle est lue dans la config qui la décide", () => {
    const arches = macArches(realConfig());
    expect(arches).toEqual(["arm64", "x64"]);
  });

  it("suit la config quand elle change, sans édition ici", () => {
    const config: EbConfigShape = { mac: { target: [{ target: "dmg", arch: ["arm64"] }] }, win: {} };
    expect(macArches(config)).toEqual(["arm64"]);
  });

  // ⚠️ ORDER matters, and that's why it's pinned. The first arch processed serves as the
  // BASE for the manifest merge: it's its top-level `path:`/`sha512:` — the
  // legacy fields a very old client would read for lack of knowing how to filter by arch — that come out on top.
  // The `files:` block, on the other hand, is identical regardless of order.
  it("traite l'arm64 en premier (la base du manifeste fusionné)", () => {
    expect(macArches(realConfig())[0]).toBe("arm64");
  });

  // FAIL CLOSED, inherited from `shippedTriples`: "no arch" is never a useful truth.
  // A config shape that has become unrecognizable must stop the release, not produce a
  // loop that notarizes nothing and ends up green.
  it("refuse un electron-builder.cjs dont la forme a changé", () => {
    expect(() => macArches({ mac: { target: [] }, win: {} })).toThrow(/aucune .*arch/i);
  });

  it("le script est bien là où le workflow l'appelle", () => {
    expect(() => readFileSync(join(EB_CONFIG, "..", "scripts", "mac-release.ts"), "utf8")).not.toThrow();
  });
});
