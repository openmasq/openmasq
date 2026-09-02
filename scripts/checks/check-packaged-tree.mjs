#!/usr/bin/env node
// Packaged-dependency guard. The ONE failure this exists for: the node_modules
// electron-builder ships is NOT the tree pnpm installed. It walks the workspace ROOT and
// keeps ONE copy per package NAME, so a nested `<pkg>/node_modules/<dep>` slot receives the
// root-hoisted version whatever the declared range says, and some packages are dropped
// outright. Dev resolves the real tree, so NOTHING here reproduces before packaging — the
// app boots for months and the shipped binary dies on launch.
//
// It has already shipped once: `htmlparser2@10` (via `linkedom`, external in the main
// bundle) was handed `entities@4.5.0` instead of `^7`, so its top-level
// `require("entities/decode")` threw ERR_PACKAGE_PATH_NOT_EXPORTED at module load — before
// any window existed. Release 0.3.2 was dead on launch, and every gate was green.
//
// Four findings. ABSENT is judged from the built main bundle, APP-MISMATCH from the app's
// own package.json (both always blocking); the other two from the DECLARED `dependencies`
// of each shipped package (so node builtins, optional/try-catch'd requires and peer deps
// cannot produce noise):
//
//   ABSENT     — the main bundle requires a package the app does not ship at all. ALWAYS
//     fatal, and the check that stops the guard from congratulating itself on an empty
//     bundle: when the collector resolves nothing there are no shipped packages left to
//     find findings in, so every other check reports green on an app that cannot start.
//     `npm run` instead of `pnpm run` produced exactly that — two packages, all green.
//   UNRESOLVED — a declared dependency whose actually-`require`d specifier does not
//     resolve in the shipped tree. This is the crash class: it throws at load time.
//   MISMATCH  — a declared dependency that resolves to a version OUTSIDE its range. Does
//     not throw; the dep just meets an API it wasn't written against, so it fails later
//     and quietly.
//
// For the latter two, severity comes from REACHABILITY, not the finding itself. The main bundle's
// externals (plus `@playwright/mcp`, dynamically imported by the re-spawned PWMCP child)
// are walked file-by-file through the shipped tree:
//
//   * REACHABLE  — the app really loads that file. HARD failure, never allowlistable:
//     this is precisely the "dead on launch" bug, so it must not be silenceable.
//   * unreachable — dead weight the collector copied out of the workspace root and
//     nothing loads (the whole `express` island arrives this way, via the MCP SDK's
//     server transports, which the desktop — a client — never touches). Ratcheted through
//     packaged-tree-allowlist.json: a frozen backlog, may only SHRINK (same contract as
//     check:loc / check:dup). Regenerate after a reviewed change with `--update`.
//
// So re-externalising a bundled dep cannot hide behind the backlog: pulling it back onto
// the load path makes its findings reachable, and reachable findings always fail.
//
// The fix for a reachable finding is almost never to ship a different version — prefer
// BUNDLING the dep (move it to devDependencies, see the externals block in
// apps/desktop/electron.vite.config.ts). Only a dep that MUST load from disk (native
// binary, file-path worker, lazily-`import()`ed asset tree) belongs in `dependencies`.
//
// Needs a PACKAGED app: run `pnpm --filter @openmasq/desktop run eb --dir` first. That
// exact spelling matters twice over — `pnpm run` (never `npm run`/`npx`, which make
// electron-builder resolve an entirely different and nearly empty dependency set), and NO
// `--` before the flags (pnpm forwards it literally and electron-builder then ignores every
// flag after it). With no build present this skips (exit 0) rather than failing — packaging
// is not a prerequisite for the cheap gates.
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep, resolve as resolvePath } from "node:path";
import { runtimeView } from "./packagedTreeView.mjs";
import { createRequire, isBuiltin } from "node:module";
import satisfies from "semver/functions/satisfies.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const allowlistPath = join(here, "packaged-tree-allowlist.json");
const update = process.argv.includes("--update");
const req = createRequire(import.meta.url);

// ---- locate the packaged tree --------------------------------------------------

// Where the unpacked tree sits INSIDE one `release/<dir>`, per platform. electron-builder
// names those dirs per target+arch (`mac-arm64/`, `win-unpacked/`, `win-arm64-unpacked/`…),
// so we walk them all and try each layout rather than guessing the dir name. The macOS
// bundle is named after the product, which has ONE home: the branding JSON (rule 9).
const BRAND = JSON.parse(readFileSync(new URL("../../packages/branding/branding.json", import.meta.url)));
const TREE_LAYOUTS = [
  `${BRAND.name}.app/Contents/Resources/app.asar.unpacked/node_modules`, // macOS
  "resources/app.asar.unpacked/node_modules", // Windows / Linux
];

function findTree() {
  const explicit = process.argv.find((a) => !a.startsWith("-") && a.includes("node_modules"));
  if (explicit) return explicit;
  const releaseDir = join(root, "apps/desktop/release");
  if (!existsSync(releaseDir)) return null;
  for (const dir of readdirSync(releaseDir)) {
    for (const layout of TREE_LAYOUTS) {
      const nm = join(releaseDir, dir, layout);
      if (existsSync(nm)) return nm;
    }
  }
  return null;
}

const FOUND = findTree();
if (!FOUND) {
  // Skipping is right when nothing is built (this runs in contexts with no packaged app),
  // but it is exactly how the check went green on a Windows build for free: only the macOS
  // layout was known, so `release/win-unpacked/` read as "nothing packaged". A caller that
  // JUST packaged knows better and passes `--require-tree`, turning a silent skip into the
  // failure it is (see the release workflows).
  const msg = "check:pkgtree — no packaged app under apps/desktop/release";
  if (process.argv.includes("--require-tree")) {
    console.error(`${msg}, but --require-tree was passed.`);
    console.error(`  layouts tried, per release/<dir>: ${TREE_LAYOUTS.join(", ")}`);
    process.exit(1);
  }
  console.log(`${msg}; skipping.`);
  console.log("  build one with: pnpm --filter @openmasq/desktop run eb --dir");
  process.exit(0);
}
// Resolution must never climb above this. Plain `require.resolve` would: from inside the
// packaged app it keeps walking up into THIS repo's node_modules and "finds" a package the
// app does not ship, turning the exact bug we hunt into a green result.
// Resolution happens in the RUNTIME view (asar ∪ unpacked), not in `app.asar.unpacked`
// alone: Electron keeps an unpacked file's `__filename` at its `app.asar/...` path, so a
// `require` falls back through the seal and loads a dependency the seal keeps inside the
// archive. Resolving against the unpacked dir alone produced 21 phantom "dead on launch"
// findings the day the 2026-08 server split stopped nesting sealed deps under their
// unpacked consumers — `packagedTreeView.mjs` carries the full story, and the one loader
// this view must NOT excuse is handled just below.
const UNPACKED_ROOT = dirname(FOUND);
const { appRoot: APP_ROOT, tree: TREE } = runtimeView(FOUND);
const SHOWN = FOUND.replace(root + sep, "");

// Trees that run inside a `worker_threads` Worker started on a REAL unpacked path: no
// asar fall-through exists there, so their dependencies must resolve from the unpacked
// dir ALONE — the strictness the merged view would otherwise lose. The loader inventory
// justifying each entry is the `asarUnpack` block of apps/desktop/electron-builder.cjs.
const REAL_PATH_WORKER_PKGS = new Set(["tesseract2.js", "tesseract.js-core"]);

// The built main bundle — the same files electron-builder packs into the asar. Read from
// disk so this needs no asar tooling.
const MAIN_OUT = join(root, "apps/desktop/out/main");

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// ---- specifier extraction ------------------------------------------------------

// Static specifiers only. A computed one cannot be checked here and is not the failure
// this guard is for.
const CALL_SPEC = /(?:require|import)\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const FROM_SPEC = /(?:^|[\s;}])(?:import|export)[^;'"]*?from\s*['"]([^'"\n]+)['"]/g;
const SCANNED = /\.(?:js|cjs|mjs)$/;
const MAX_BYTES = 2 * 1024 * 1024; // a 2 MB+ file is a prebuilt bundle; its deps are inlined

function specifiersOf(file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return [];
  }
  if (st.size > MAX_BYTES) return [];
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = new Set();
  for (const m of src.matchAll(CALL_SPEC)) out.add(m[1]);
  for (const m of src.matchAll(FROM_SPEC)) out.add(m[1]);
  return [...out];
}

function filesUnder(dir, { intoNested = false } = {}) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try {
      ents = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        if (intoNested || e.name !== "node_modules") stack.push(full);
        continue;
      }
      if (SCANNED.test(e.name) && !e.name.endsWith(".min.js")) out.push(full);
    }
  }
  return out;
}

/**
 * "entities/decode" -> "entities"; "@scope/pkg/sub" -> "@scope/pkg"; null for anything that
 * isn't a package (relative, absolute, or a node builtin — `isBuiltin` so the UNPREFIXED
 * spellings count too: `crypto` and `fs/promises` are builtins just as much as `node:crypto`).
 */
function pkgNameOf(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || isBuiltin(spec)) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// ---- resolution, confined to the shipped tree ---------------------------------

/** The `node_modules` dir inside the app that owns `name`, or null if the app ships none. */
function ownerNodeModules(fromDir, name, limit = APP_ROOT) {
  let cur = fromDir;
  while (cur.startsWith(limit)) {
    const nm = join(cur, "node_modules");
    if (existsSync(join(nm, name, "package.json"))) return nm;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/**
 * Resolve `spec` the way the app would. Two distinct outcomes matter and both are `null`:
 * the package is absent from the bundle, or it is present but does not EXPORT the requested
 * subpath (ERR_PACKAGE_PATH_NOT_EXPORTED — the `entities/decode` crash).
 */
function resolveBare(fromDir, spec, limit = APP_ROOT) {
  const name = pkgNameOf(spec);
  if (!name) return null;
  const nm = ownerNodeModules(fromDir, name, limit);
  if (!nm) return null;
  try {
    // `paths: [dirname(nm)]` makes Node look in `nm` FIRST, so it lands on the copy the app
    // actually ships instead of one further up.
    return req.resolve(spec, { paths: [dirname(nm)] });
  } catch {
    return null;
  }
}

function resolveRelative(fromFile, spec) {
  try {
    return req.resolve(resolvePath(dirname(fromFile), spec));
  } catch {
    return null;
  }
}

// ---- reachability: what the app actually loads ---------------------------------

// Entry specifiers = every bare specifier the built main bundle asks for, plus the PWMCP
// child's dynamic import (present in the bundle, but listed explicitly so a refactor of
// that call site can't silently drop the whole browser-server closure from the walk).
function entrySpecifiers() {
  const specs = new Set(["@playwright/mcp"]);
  if (!existsSync(MAIN_OUT)) {
    console.warn(`check:pkgtree — ${MAIN_OUT.replace(root + sep, "")} missing; run electron-vite build.`);
    console.warn("  reachability is unknown, so EVERY finding is treated as reachable.");
    return null;
  }
  for (const f of filesUnder(MAIN_OUT, { intoNested: true })) {
    for (const s of specifiersOf(f)) if (pkgNameOf(s)) specs.add(s);
  }
  return specs;
}

const entries = entrySpecifiers();

/** Every file inside the shipped tree that the app can actually load. */
function reachableFiles() {
  if (entries === null) return null; // unknown → treat everything as reachable
  const seen = new Set();
  const queue = [];
  for (const s of entries) {
    const f = resolveBare(APP_ROOT, s);
    if (f) queue.push(f);
  }
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !file.startsWith(TREE)) continue;
    seen.add(file);
    for (const spec of specifiersOf(file)) {
      const next = spec.startsWith(".") ? resolveRelative(file, spec) : resolveBare(dirname(file), spec);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

// The entry specifiers themselves must RESOLVE. Without this the guard has a blind spot big
// enough to drive the whole app through: when the collector ships (almost) nothing, there are
// no packages left to find findings in, the reachable set is empty, and everything reports
// green on an app that cannot start. That is not hypothetical — `npm run` instead of
// `pnpm run` makes electron-builder resolve its dependency graph as npm, and it packaged an
// app with TWO packages in node_modules. `electron` is excluded: the runtime provides it.
function missingExternals() {
  if (entries === null) return [];
  const missing = [];
  for (const spec of entries) {
    if (pkgNameOf(spec) === "electron") continue;
    if (!resolveBare(APP_ROOT, spec)) missing.push(spec);
  }
  return missing.sort();
}

const absentEntries = missingExternals();
const loaded = reachableFiles();
const isReachableFile = (f) => loaded === null || loaded.has(f);
/** A package counts as loaded when any file inside it is. */
function isReachablePkg(dir) {
  if (loaded === null) return true;
  for (const f of loaded) if (f.startsWith(dir + sep)) return true;
  return false;
}

// ---- collect findings ----------------------------------------------------------

const pkgDirs = [];
function collect(nmDir, depth = 0) {
  if (depth > 12) return;
  let ents;
  try {
    ents = readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const full = join(nmDir, e.name);
    if (e.name.startsWith("@")) {
      collect(full, depth); // scope dir — its children are the packages
      continue;
    }
    if (existsSync(join(full, "package.json"))) pkgDirs.push(full);
    const nested = join(full, "node_modules");
    if (existsSync(nested)) collect(nested, depth + 1);
  }
}
collect(TREE);

const findings = []; // { key, reachable }

// ── deliberate substitutions (pnpm.overrides → a LOCAL package) ─────────────────────────
//
// `packages/ort` TAKES THE PLACE of `onnxruntime-node` (root override `link:packages/ort`):
// the package shipped under that name therefore carries the shim's version (0.0.0), and any
// comparison against the declared range — the app's as well as `@huggingface/transformers`'s
// — reports a gap that is not one. This is not debt to freeze in the allowlist (which may
// only shrink): it is information this guard did not have.
//
// ⚠️ What this does NOT excuse, and that is the point: only the VERSION stops being
// compared. That the package is present, resolvable, and that its own dependencies are too,
// stays checked — which is precisely what caught `ort-native`/`ort-wasm` missing from the
// app. Only LOCAL targets are exempted (`link:`/`file:`/`workspace:`): an override to an npm
// version must keep being confronted with the ranges.
const substituted = new Set(
  Object.entries(readJson(join(root, "package.json"))?.pnpm?.overrides ?? {})
    .filter(([, target]) => /^(?:link|file|workspace):/.test(String(target)))
    .map(([name]) => name.replace(/@[^@]*$/, "")),
);

for (const dir of pkgDirs) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg?.name) continue;
  const deps = pkg.dependencies || {};
  const declared = Object.keys(deps);
  if (!declared.length) continue;
  const self = `${pkg.name}@${pkg.version ?? "?"}`;

  // MISMATCH — declared range vs the version actually reachable from here.
  for (const [name, range] of Object.entries(deps)) {
    if (/^(?:workspace|file|link|npm):/.test(range)) continue;
    if (substituted.has(name)) continue; // replaced by a local package — see `substituted`
    const target = resolveBare(dir, `${name}/package.json`);
    const got = target ? readJson(target)?.version : null;
    if (!got) continue; // absent or unexported → the UNRESOLVED pass owns it
    let ok = true;
    try {
      ok = satisfies(got, range, { includePrerelease: true });
    } catch {
      ok = true; // an unparseable range (url/git dep) is not this guard's business
    }
    if (!ok) {
      findings.push({
        key: `MISMATCH ${self} declares ${name}@${range} — shipped ${got}`,
        reachable: isReachablePkg(dir),
      });
    }
  }

  // UNRESOLVED — a specifier the code really asks for, on a dep it really declares.
  // A real-path worker tree resolves from its UNPACKED twin, asar excluded (see
  // REAL_PATH_WORKER_PKGS): the merged view models the loaders that fall back through
  // the seal, and these are exactly the ones that cannot.
  const strict = REAL_PATH_WORKER_PKGS.has(pkg.name);
  for (const file of filesUnder(dir)) {
    for (const spec of specifiersOf(file)) {
      const name = pkgNameOf(spec);
      if (!name || !declared.includes(name)) continue;
      const from = strict
        ? join(UNPACKED_ROOT, "node_modules", relative(TREE, dirname(file)))
        : dirname(file);
      if (resolveBare(from, spec, strict ? UNPACKED_ROOT : APP_ROOT)) continue;
      findings.push({
        key: `UNRESOLVED ${self} requires "${spec}" — does not resolve`,
        reachable: isReachableFile(file),
      });
    }
  }
}

// A key seen both reachable and not (two call sites) counts as reachable.
const byKey = new Map();
for (const f of findings) byKey.set(f.key, (byKey.get(f.key) ?? false) || f.reachable);
const keys = [...byKey.keys()].sort();

// Only an UNRESOLVED on the load path is un-silenceable: it is the one that THROWS, and it
// throws where the app cannot survive it. A reachable MISMATCH is a real smell but not a
// crash (the dep meets an API it wasn't written against and may well cope), and several are
// unavoidable patch-level drift from the root tree — gating on those would mean a gate no
// build can pass, which is how a guard gets disabled. They stay in the backlog, reported
// under their own louder heading.
// The APP's own declared `dependencies` vs what actually shipped. Its package.json is the
// one declaration the developer directly controls, and it is NOT inside node_modules, so the
// per-package walk above never sees it — which is how the app declared `undici@^6.28.0` and
// shipped 7.29.0 (the collector takes the ROOT-hoisted copy; the pnpm-nested 6.x under
// apps/desktop is ignored). Always blocking: either the tree is wrong or the declaration is —
// both are a one-line fix, and silencing it would un-pin the app from its own manifest.
function appManifestDrift() {
  const appPkg = readJson(join(root, "apps/desktop/package.json"));
  const drift = [];
  for (const [name, range] of Object.entries(appPkg?.dependencies ?? {})) {
    if (/^(?:workspace|file|link|npm):/.test(range)) continue;
    if (substituted.has(name)) continue; // replaced by a local package — see `substituted`
    const target = resolveBare(APP_ROOT, `${name}/package.json`);
    const got = target ? readJson(target)?.version : null;
    if (!got) continue; // absent → the ABSENT check owns it (via the bundle's requires)
    let ok = true;
    try {
      ok = satisfies(got, range, { includePrerelease: true });
    } catch {
      ok = true;
    }
    if (!ok) drift.push(`APP-MISMATCH the app declares ${name}@${range} but ships ${got}`);
  }
  return drift.sort();
}

const blocking = [
  ...absentEntries.map((s) => `ABSENT the main bundle requires "${s}" — no such package in the shipped app`),
  ...appManifestDrift(),
  ...keys.filter((k) => byKey.get(k) && k.startsWith("UNRESOLVED")),
];
const backlog = keys.filter((k) => !blocking.includes(k));
const reachableBacklog = new Set(backlog.filter((k) => byKey.get(k)));

// ---- report --------------------------------------------------------------------

if (update) {
  if (blocking.length) {
    console.error("check:pkgtree — refusing to allowlist: these throw on the app's load path.\n");
    for (const k of blocking) console.error(`  ${k}`);
    console.error("\nFix them (bundle the dep) — the backlog never covers a reachable UNRESOLVED.\n");
    process.exit(1);
  }
  writeFileSync(allowlistPath, JSON.stringify({ findings: backlog }, null, 2) + "\n");
  console.log(`check:pkgtree — allowlist regenerated with ${backlog.length} entr${backlog.length === 1 ? "y" : "ies"}.`);
  process.exit(0);
}

const allowed = new Set(readJson(allowlistPath)?.findings ?? []);
const newBacklog = backlog.filter((k) => !allowed.has(k));
const fixed = [...allowed].filter((k) => !byKey.has(k));

console.log(
  `check:pkgtree — ${pkgDirs.length} shipped packages, ` +
    `${loaded === null ? "reachability UNKNOWN" : `${loaded.size} files on the load path`} ` +
    `(${SHOWN})`,
);

if (fixed.length) {
  console.log(`\n${fixed.length} allowlisted finding(s) no longer reproduce — run --update to shrink the backlog:`);
  for (const k of fixed) console.log(`  ✔ ${k}`);
}

if (blocking.length) {
  console.error(`\n✘ ${blocking.length} finding(s) ON THE APP'S LOAD PATH — not allowlistable:\n`);
  for (const k of blocking) console.error(`  ${k}`);
  console.error(
    "\nThese throw at module load: the app is DEAD ON LAUNCH.\n" +
      "Many ABSENT lines at once = the collector resolved nothing. Check you packaged with\n" +
      "`pnpm run eb`, never `npm run`/`npx` — electron-builder picks its collector from the runner.\n" +
      "Otherwise prefer BUNDLING the dep over shipping it external — move it to devDependencies\n" +
      "and see the externals block in apps/desktop/electron.vite.config.ts.\n",
  );
}

if (newBacklog.length) {
  const onPath = newBacklog.filter((k) => reachableBacklog.has(k));
  const dormant = newBacklog.filter((k) => !reachableBacklog.has(k));
  if (onPath.length) {
    console.error(`\n✘ ${onPath.length} NEW finding(s) on the load path (no crash, but the dep meets an API it wasn't written against):\n`);
    for (const k of onPath) console.error(`  ${k}`);
  }
  if (dormant.length) {
    console.error(`\n✘ ${dormant.length} NEW dormant finding(s) (shipped, but nothing loads them):\n`);
    for (const k of dormant) console.error(`  ${k}`);
  }
  console.error("\nIf they are genuinely tolerable: node scripts/checks/check-packaged-tree.mjs --update\n");
}

if (blocking.length || newBacklog.length) process.exit(1);
console.log(
  `\nOK — nothing unresolvable on the load path (${allowed.size} finding(s) in the backlog, ` +
    `${reachableBacklog.size} of them reachable).`,
);
