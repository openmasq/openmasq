// What ONE macOS arch's app has nothing to embed from the OTHER — and the proof, at build time,
// that it still has an ONNX engine left.
//
// ⛔ WHY HERE AND NOT IN `electron-builder.cjs`'s `files`. The patterns there are indeed
// expanded per arch (`FileMatcher.normalizePattern` passes EVERY pattern through the `macroExpander`,
// so `${arch}` works), but there is no "the other arch" macro. The natural
// workaround — exclude both, re-include one's own — is a TRAP: for `node_modules`,
// `getNodeModuleFileMatcher` only keeps NEGATIVE patterns ("grab only excludes", its own
// comment says), so the catch-up pattern is silently dropped and the app ships with NO
// native binary at all. Dead on launch, green build.
//
// `afterPack`, on the other hand, receives `context.arch`: it knows which machine we're talking about. And it runs
// BEFORE signing (see `afterPack.cjs`), so deleting here invalidates no signature.
//
// ⚠️ This file doesn't ONLY slim things down: it verifies (rule 7, fail CLOSED). An .app whose
// ONNX engine is missing does not redact; since the send path fails closed, the app would send
// NOTHING. This must not be discovered at the user's, so its absence breaks the BUILD.
"use strict";
const { existsSync, readdirSync, rmSync, statSync } = require("node:fs");
const path = require("node:path");

/** The mac arch we are NOT building. */
const OTHER = { arm64: "x64", x64: "arm64" };

/** The platform whose prebuilts have NO business in the app we are building. */
const FOREIGN_PLATFORM = { darwin: "win32", win32: "darwin" };

/**
 * The families of prebuilts published as "platform" packages, which
 * `supportedArchitectures` (root package.json) installs ALL of. The suffix varies
 * (`win32-x64-msvc`, `darwin-arm64`, …), so we cut by name PREFIX.
 */
const PLATFORM_PACKAGES = [
  { parent: "@libsql", prefix: (p) => `${p}-` },
  { parent: "@napi-rs", prefix: (p) => `canvas-${p}-` },
  { parent: "@img", prefix: (p) => `sharp-${p}-` },
  { parent: "@img", prefix: (p) => `sharp-libvips-${p}-` },
];

/** The two names under which the native ONNX engine stores its binaries, per platform. */
function engineBins(platform) {
  return [`ort-native/bin/napi-v6/${platform}`, `onnxruntime-node/bin/napi-v6/${platform}`];
}

/**
 * What we remove, and what must remain, for a given platform + arch.
 *
 * ⚠️ This plan carries TWO sorts, and the second only joined the first after a leak:
 *   • the other ARCH (mac ships arm64 AND x64 from a single runner);
 *   • the other PLATFORM — that used to live in electron-builder's `mac.files`/`win.files`,
 *     and those keys were shipping all of `apps/desktop/` into the app along the way (the `mac:`
 *     block in `electron-builder.cjs` tells the mechanism). Deleting here does the same
 *     job without touching the matcher that decides the app's contents.
 *
 * Pure (no disk access) so it can be pinned by `archPrune.test.ts`: it's the table that
 * decides, and a wrong table is exactly the kind of thing a build doesn't say.
 *
 * `drop[].rel` is a path RELATIVE to `node_modules`; with `ext`, only files of
 * that extension are removed (the folder and its JS remain). `drop[].parent` + `prefix`
 * removes every folder of `parent` whose name starts with `prefix`.
 * `keep[].any` is a LIST of possible locations — one is enough. Two names coexist:
 * `ort-native`/`ort-wasm` are `@openmasq/ort`'s aliases (the package that chooses the engine
 * at runtime), `onnxruntime-node` is the name that came before that package.
 */
function prunePlan(platform, arch) {
  const foreign = FOREIGN_PLATFORM[platform];
  if (!foreign) throw new Error(`archPrune: plateforme inconnue : ${platform}`);

  // The OTHER PLATFORM, first — same list on both sides, read as a mirror.
  const foreignPlatform = [
    ...PLATFORM_PACKAGES.map(({ parent, prefix }) => ({ parent, prefix: prefix(foreign) })),
    ...engineBins(foreign).map((rel) => ({ rel })),
  ];

  if (platform === "win32") return { drop: [...foreignPlatform, ...winArchDrop()], keep: winKeep() };
  const mac = macPlan(arch);
  return { drop: [...foreignPlatform, ...mac.drop], keep: mac.keep };
}

/**
 * Windows ships ONLY x64 (`win.target`): the `win32-arm64` prebuilts installed by
 * `supportedArchitectures` are code that can't run, re-shipped on every update.
 */
function winArchDrop() {
  return [
    { parent: "@libsql", prefix: "win32-arm64-" },
    { parent: "@napi-rs", prefix: "canvas-win32-arm64-" },
    ...["ort-native", "onnxruntime-node"].map((n) => ({ rel: `${n}/bin/napi-v6/win32/arm64` })),
  ];
}

/** FAIL CLOSED on the Windows side: without these two, the app installs and is useless. */
function winKeep() {
  return [
    {
      any: ["ort-native/bin/napi-v6/win32/x64", "onnxruntime-node/bin/napi-v6/win32/x64"],
      ext: ".node",
      why: "le binding natif ONNX — sans lui le NER local ne démarre pas, et l'app refuse tout envoi",
    },
    {
      any: ["@libsql/win32-x64-msvc"],
      ext: ".node",
      why: "la base locale (conversations, coffre) — son absence tue l'app au démarrage",
    },
  ];
}

/** The mac plan: the other ARCH, and the engine that must remain. */
function macPlan(arch) {
  const other = OTHER[arch];
  if (!other) throw new Error(`archPrune: arche mac inconnue : ${arch}`);

  // The other arch's prebuilts. `supportedArchitectures` (root package.json)
  // installs BOTH of them — that's what makes the cross build possible, and it's also what
  // would ship them into both .apps if nobody cut them.
  const drop = [
    { rel: `@libsql/darwin-${other}` },
    { rel: `@napi-rs/canvas-darwin-${other}` },
    { rel: `@img/sharp-darwin-${other}` },
    { rel: `@img/sharp-libvips-darwin-${other}` },
  ];

  if (arch === "arm64") {
    // WASM is only useful where no native binding exists. On arm64 there is one, so
    // these ~125 MB would never be loaded — but they would be downloaded on EVERY
    // update. We only remove the binaries: the JS stays, so a hypothetical fallback
    // would fail loudly instead of half-working.
    drop.push({ rel: "ort-wasm/dist", ext: ".wasm" });
  } else {
    // There is NO native `darwin/x64` binding at all (that's the whole reason for `@openmasq/ort`).
    // The bytes present under `bin/` are therefore arm64: unusable here, and misleading.
    drop.push({ rel: "ort-native/bin" }, { rel: "onnxruntime-node/bin" });
  }

  const keep =
    arch === "arm64"
      ? [
          {
            any: ["ort-native/bin/napi-v6/darwin/arm64", "onnxruntime-node/bin/napi-v6/darwin/arm64"],
            ext: ".node",
            why: "le binding natif ONNX — sans lui le NER local ne démarre pas, et l'app refuse tout envoi",
          },
        ]
      : [
          {
            any: ["ort-wasm/dist"],
            ext: ".wasm",
            why: "le moteur WASM — seul moteur ONNX possible sur Intel (aucun binding natif darwin/x64 n'existe)",
          },
        ];
  keep.push({
    any: [`@libsql/darwin-${arch}`],
    ext: ".node",
    why: "la base locale (conversations, coffre) — son absence tue l'app au démarrage",
  });

  return { drop, keep };
}

/** Bytes of a file or a tree (0 if absent). */
function sizeOf(target) {
  if (!existsSync(target)) return 0;
  const st = statSync(target);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    total += sizeOf(path.join(target, entry.name));
  }
  return total;
}

/** True if `dir` contains (recursively) at least one file with extension `ext`. */
function hasFileWithExt(dir, ext) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory() ? hasFileWithExt(child, ext) : entry.name.endsWith(ext)) return true;
  }
  return false;
}

/** Applies the plan to a packaged `node_modules`. Returns the bytes freed. */
function applyPlan(nodeModules, plan) {
  let freed = 0;
  for (const { rel, ext, parent, prefix } of plan.drop) {
    // Cuts by PREFIX: platform packages have no fixed name
    // (`win32-x64-msvc`, `darwin-arm64`, `sharp-libvips-win32-ia32`…).
    if (parent) {
      const dir = path.join(nodeModules, parent);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
        const target = path.join(dir, entry.name);
        freed += sizeOf(target);
        rmSync(target, { recursive: true, force: true });
      }
      continue;
    }
    const target = path.join(nodeModules, rel);
    if (!existsSync(target)) continue;
    if (!ext) {
      freed += sizeOf(target);
      rmSync(target, { recursive: true, force: true });
      continue;
    }
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory() || !entry.name.endsWith(ext)) continue;
      const file = path.join(target, entry.name);
      freed += sizeOf(file);
      rmSync(file, { force: true });
    }
  }
  return freed;
}

/** FAIL CLOSED: what the built target must still contain, or the build stops. */
function assertKept(nodeModules, plan, cible) {
  for (const { any, ext, why } of plan.keep) {
    if (any.some((rel) => hasFileWithExt(path.join(nodeModules, rel), ext))) continue;
    throw new Error(
      `archPrune: l'app ${cible} ne contient aucun ${ext} sous ${any.join(" | ")} — ${why}. ` +
        `Build interrompu : un .app sans ça s'installe et ne sert à rien.`,
    );
  }
}

/** The packaged app's `node_modules` (unbundled from the asar by `asarUnpack`). */
function packagedNodeModules(appOutDir, productFilename, platform = "darwin") {
  const resources =
    platform === "darwin"
      ? path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  for (const candidate of ["app.asar.unpacked", "app"]) {
    const dir = path.join(resources, candidate, "node_modules");
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `archPrune: aucun node_modules empaqueté sous ${resources}. La disposition a changé — ` +
      `ne PAS ignorer : c'est ainsi qu'un garde cesse de garder sans rien dire.`,
  );
}

/**
 * `afterPack`'s entry point: remove the other platform AND the other arch, then
 * prove that the target's engine is still there.
 */
function pruneForeignArch({ appOutDir, arch, productFilename, platform = "darwin" }) {
  const plan = prunePlan(platform, arch);
  const nodeModules = packagedNodeModules(appOutDir, productFilename, platform);
  const freed = applyPlan(nodeModules, plan);
  assertKept(nodeModules, plan, `${platform}-${arch}`);
  return { freed, nodeModules };
}

module.exports = { prunePlan, applyPlan, assertKept, packagedNodeModules, pruneForeignArch };
