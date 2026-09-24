#!/usr/bin/env node
// Packaged-dependency guard. electron-builder does not ship the tree pnpm installed: it
// walks the workspace ROOT and keeps ONE copy per package NAME, so a nested dependency may
// receive the hoisted version whatever its declared range says, or be dropped outright. Dev
// resolves the real tree, so nothing here reproduces before packaging.
//
// Findings: ABSENT (the main bundle requires a package the app does not ship — always fatal,
// and the check that keeps an empty bundle from reporting green), APP-MISMATCH (the app's own
// package.json vs what shipped — always blocking), UNRESOLVED (a declared dependency whose
// required specifier does not resolve — the load-time crash class) and MISMATCH (resolves
// outside its declared range — fails later and quietly). For the latter two, severity comes
// from REACHABILITY: a finding on a file the app really loads is a HARD failure, never
// allowlistable; dead weight the collector copied and nothing loads is ratcheted through
// packaged-tree-allowlist.json (a backlog that may only SHRINK; `--update` after review).
//
// The fix for a reachable finding is to BUNDLE the dep (devDependencies + the externals block
// of apps/desktop/electron.vite.config.ts); only a dep that MUST load from disk belongs in
// `dependencies`. Needs a packaged app: `pnpm --filter @openmasq/desktop run eb --dir`, with
// `pnpm run` (npm resolves a different, nearly empty tree) and no `--` before the flags (pnpm
// forwards it literally). No build present ⇒ skip (exit 0).
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

// Where the unpacked tree sits inside a `release/<dir>`, per platform. The dir is named per
// target+arch, so every layout is tried. The macOS bundle is named from the branding JSON (rule 9).
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
  // No packaged app ⇒ skip. A caller that JUST packaged passes `--require-tree`, so an
  // unknown layout fails instead of reading as "nothing packaged".
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
// Resolution must never climb above the packaged app: plain `require.resolve` would find this
// repo's node_modules and turn the bug we hunt into a green result. It runs in the RUNTIME
// view (asar ∪ unpacked): Electron keeps an unpacked file's `__filename` at its `app.asar/...`
// path, so a `require` falls back through the seal — see `packagedTreeView.mjs`.
const UNPACKED_ROOT = dirname(FOUND);
const { appRoot: APP_ROOT, tree: TREE } = runtimeView(FOUND);
const SHOWN = FOUND.replace(root + sep, "");

// Trees run inside a `worker_threads` Worker on a REAL unpacked path have no asar
// fall-through: their deps must resolve from the unpacked dir ALONE. The loader inventory is
// the `asarUnpack` block of apps/desktop/electron-builder.cjs.
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
 * Resolve `spec` the way the app would. Two outcomes are both `null`: the package is absent,
 * or present but does not EXPORT the requested subpath (ERR_PACKAGE_PATH_NOT_EXPORTED).
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

// The entry specifiers themselves must RESOLVE: when the collector ships (almost) nothing, the
// reachable set is empty and every other check reports green on an app that cannot start.
// `electron` is excluded: the runtime provides it.
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

// Deliberate substitutions (pnpm.overrides → a LOCAL package): `packages/ort` takes the place
// of `onnxruntime-node`, so the shipped version (0.0.0) is not compared against the declared
// ranges. ONLY the version is excused — presence, resolution and the package's own deps stay
// checked. Only `link:`/`file:`/`workspace:` targets qualify; an npm override keeps its ranges.
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

  // UNRESOLVED — a specifier the code really asks for, on a dep it really declares. A
  // real-path worker tree resolves from its UNPACKED twin (REAL_PATH_WORKER_PKGS).
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

// Only an UNRESOLVED on the load path is un-silenceable: it throws where the app cannot
// survive it. A reachable MISMATCH is reported under its own heading but stays in the backlog:
// patch-level drift from the root tree is unavoidable, and a gate no build can pass gets disabled.
// The APP's own declared `dependencies` vs what shipped: its package.json is outside
// node_modules, so the per-package walk never sees it. Always blocking — either the tree or
// the declaration is wrong, and both are a one-line fix.
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
