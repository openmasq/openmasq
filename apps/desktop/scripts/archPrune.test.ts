// What goes into the .app of EACH mac arch. The table in `archPrune.cjs` isn't verifiable
// anywhere else: at build time it's correct, or the app is dead for the user.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { prunePlan, applyPlan, assertKept } = require("./archPrune.cjs");

/** A throwaway `node_modules` where each given path exists with a file inside it. */
function fauxNodeModules(fichiers: Record<string, string>): string {
  const racine = mkdtempSync(join(tmpdir(), "archprune-"));
  for (const [rel, nom] of Object.entries(fichiers)) {
    const dir = join(racine, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, nom), "x");
  }
  return racine;
}

const NATIF = "ort-native/bin/napi-v6/darwin/arm64";
const WASM = "ort-wasm/dist";

/** The exact paths of a plan (PREFIX cuts don't have one — see `prefixes`). */
const rels = (plan: { drop: { rel?: string }[] }) => plan.drop.map((d) => d.rel).filter(Boolean) as string[];
/** Prefix cuts, as `parent/prefix` — the shape of "platform" packages. */
const prefixes = (plan: { drop: { parent?: string; prefix?: string }[] }) =>
  plan.drop.filter((d) => d.parent).map((d) => `${d.parent}/${d.prefix}`);

describe("prunePlan", () => {
  it("retire l'autre arche, jamais la sienne", () => {
    for (const [arch, autre] of [["arm64", "x64"], ["x64", "arm64"]] as const) {
      const cibles = rels(prunePlan("darwin", arch));
      expect(cibles).toContain(`@libsql/darwin-${autre}`);
      expect(cibles.some((r: string) => r.includes(`darwin-${arch}`))).toBe(false);
    }
  });

  it("x64 jette les binaires ONNX natifs — il n'en existe aucun pour lui", () => {
    const { drop } = prunePlan("darwin", "x64");
    expect(rels({ drop })).toEqual(
      expect.arrayContaining(["ort-native/bin", "onnxruntime-node/bin"]),
    );
  });

  it("arm64 jette les .wasm mais garde leur JS — un repli doit échouer, pas marcher à moitié", () => {
    const wasm = prunePlan("darwin", "arm64").drop.find((d: { rel?: string }) => d.rel === WASM);
    expect(wasm).toMatchObject({ ext: ".wasm" });
  });

  it("refuse une arche qu'elle ne connaît pas plutôt que de deviner", () => {
    expect(() => prunePlan("darwin", "universal")).toThrow(/arche mac inconnue/);
  });

  it("refuse une plateforme inconnue de la même façon", () => {
    expect(() => prunePlan("linux", "x64")).toThrow(/plateforme inconnue/);
  });

  // ── What `mac.files`/`win.files` used to do, and had to move here: those keys
  // shipped ALL of `apps/desktop/` into the app along the way (electron-builder.cjs, the
  // `mac:` block). The pruning must therefore survive their removal — that's what these two
  // cases pin, each in the direction of its mirror.
  it("mac retire les prébuilts Windows, Windows retire ceux de mac", () => {
    expect(prefixes(prunePlan("darwin", "arm64"))).toEqual(
      expect.arrayContaining(["@libsql/win32-", "@napi-rs/canvas-win32-", "@img/sharp-win32-"]),
    );
    expect(rels(prunePlan("darwin", "arm64"))).toEqual(
      expect.arrayContaining(["ort-native/bin/napi-v6/win32", "onnxruntime-node/bin/napi-v6/win32"]),
    );
    expect(prefixes(prunePlan("win32", "x64"))).toEqual(
      expect.arrayContaining(["@libsql/darwin-", "@napi-rs/canvas-darwin-", "@img/sharp-darwin-"]),
    );
    expect(rels(prunePlan("win32", "x64"))).toEqual(
      expect.arrayContaining(["ort-native/bin/napi-v6/darwin", "onnxruntime-node/bin/napi-v6/darwin"]),
    );
  });

  it("aucun plan ne coupe SA propre plateforme", () => {
    expect(prefixes(prunePlan("darwin", "arm64")).some((p) => p.includes("darwin"))).toBe(false);
    expect(prefixes(prunePlan("win32", "x64")).some((p) => p === "@libsql/win32-")).toBe(false);
  });

  it("Windows ne livre que x64 : l'arm64 installé par supportedArchitectures part", () => {
    expect(prefixes(prunePlan("win32", "x64"))).toContain("@libsql/win32-arm64-");
  });
});

describe("applyPlan", () => {
  it("ne touche pas au JS quand seul l'extension est visée", () => {
    const nm = fauxNodeModules({ [WASM]: "ort.mjs" });
    writeFileSync(join(nm, WASM, "ort-wasm-simd-threaded.wasm"), "x");
    applyPlan(nm, prunePlan("darwin", "arm64"));
    expect(existsSync(join(nm, WASM, "ort.mjs"))).toBe(true);
    expect(existsSync(join(nm, WASM, "ort-wasm-simd-threaded.wasm"))).toBe(false);
  });
});

describe("assertKept — échec FERMÉ", () => {
  it("laisse passer une app arm64 qui a son binding natif", () => {
    const nm = fauxNodeModules({ [NATIF]: "onnxruntime_binding.node", "@libsql/darwin-arm64": "index.node" });
    expect(() => assertKept(nm, prunePlan("darwin", "arm64"), "arm64")).not.toThrow();
  });

  it("laisse passer une app x64 qui a son WASM", () => {
    const nm = fauxNodeModules({ [WASM]: "ort-wasm-simd-threaded.wasm", "@libsql/darwin-x64": "index.node" });
    expect(() => assertKept(nm, prunePlan("darwin", "x64"), "x64")).not.toThrow();
  });

  // THE case that justifies the whole file: without `@openmasq/ort`, an Intel app has NO
  // ONNX engine at all. It would install, and refuse every send. The build must fail.
  it("casse le build d'une app x64 sans moteur ONNX", () => {
    const nm = fauxNodeModules({ "@libsql/darwin-x64": "index.node" });
    expect(() => assertKept(nm, prunePlan("darwin", "x64"), "x64")).toThrow(/aucun \.wasm/);
  });

  it("casse le build d'une app sans base locale", () => {
    const nm = fauxNodeModules({ [NATIF]: "onnxruntime_binding.node" });
    expect(() => assertKept(nm, prunePlan("darwin", "arm64"), "arm64")).toThrow(/@libsql\/darwin-arm64/);
  });
});
