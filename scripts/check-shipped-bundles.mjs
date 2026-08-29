#!/usr/bin/env node
// What ships to a user must not EXPLAIN the code it contains.
//
// None of what follows is protection: a `.crx` is a zip, an `.asar` is a tar, a Capacitor
// bundle sits in the clear inside the IPA/APK. All of that can be read, and always will be.
// What this gate forbids is SHIPPING the explanation WITH it — the sourcemap that renders
// the original TypeScript verbatim, and the comments which, in this repository, describe
// the threat model and the guard that covers it. Both used to ship: 16 `.map` files with
// `sourcesContent` in the published extension, and 806 intact comments in
// `apps/desktop/out/main/index.js`.
//
// Two properties, checked on the BUILT artefacts (a vite setting is an intention; only the
// deliverable file is proof):
//   1. aucune sourcemap, ni fichier `.map`, ni `sourceMappingURL` (y compris `data:`) ;
//   2. a near-zero comment density = the bundle really is minified.
//
// A target that is not built is SKIPPED, not an error: `pnpm verify` must stay useful
// without having packaged everything. It is `.github/workflows/verify.yml` that runs
// `pnpm build` first, so CI sees all three. `--require-all` forces all three to be present.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// The SAME table `afterPack.cjs` applies at build time: a second list here would drift
// from the first with nothing to say so (rule 9).
const { findPackagingViolations, formatViolations } = require("../apps/desktop/scripts/packageContents.cjs");
const { listPackage } = require("@electron/asar");
const requireAll = process.argv.includes("--require-all");

/**
 * `maps`: the whole shipped folder — NOTHING legitimate ships a sourcemap there, not even
 * a vendored dependency. `code`: our own bundles, the only ones whose minification is our
 * business (vendored prebuilts — onnxruntime, tesseract — arrive as-is and carry their own
 * licence headers, which we do not rewrite).
 */
const TARGETS = [
  {
    name: "desktop",
    // ⚠️ Desktop is the intended EXCEPTION: its maps are produced as `hidden`
    // (electron.vite.config.ts) as artefacts for the Sentry UPLOAD (release.yml) — in
    // `out/`, never inside the app.
    //
    // ⛔ WHAT IS NOT ENOUGH, and proved it: this gate long checked that the line
    // `!out/**/*.map` APPEARED in electron-builder.yml. It did appear, the gate was green —
    // and the app shipped the 26 maps anyway, plus `src/`, `e2e/` and the `.env` files,
    // because the whole allowlist had stopped applying (the shape of `mac.files`; see that
    // block's comment in electron-builder.yml). Grepping a config file = checking an
    // INTENTION, which is exactly what this file reproaches vite settings for.
    //
    // So the guarantee lives where the artefact exists: `apps/desktop/scripts/afterPack.cjs`
    // reads back the produced app.asar and breaks packaging (mac AND Windows, every path,
    // before signing). Here we only re-check if an `.app` already sits on the disk.
    maps: [],
    asarGuard: "apps/desktop/release",
    code: ["apps/desktop/out/main", "apps/desktop/out/preload", "apps/desktop/out/renderer/assets"],
    build: "cd apps/desktop && npx electron-vite build",
  },
];

/**
 * The minification signal is BYTES PER LINE, not comment density. Counting comments looks
 * more direct and does not work: esbuild PRESERVES licence headers while minifying
 * (`legalComments: "eof"` by default — 40 lines of `@license React` in the renderer's big
 * chunk), and a stylesheet embedded in a template literal looks line for line like a
 * comment. Both used to fail a perfectly minified bundle.
 *
 * Measured on this repository's artefacts: minified = 732 to 8,342 bytes/line; in the
 * clear, ~50. So the threshold is wide on both sides — it does not discriminate finely, it
 * separates two regimes that have nothing to do with each other.
 */
const MIN_BYTES_PER_LINE = 200;
/** Below that, the average means nothing (an entry shim is 2 lines). */
const MIN_BYTES = 50 * 1024;

function* jsFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (/\.(js|cjs|mjs)$/.test(name)) yield p;
  }
}

/** The `app.asar` files under a release folder (mac-arm64/, mac/, win-unpacked/, …). */
function* asarFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* asarFiles(p);
    else if (name === "app.asar") yield p;
  }
}

function* mapFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* mapFiles(p);
    else if (name.endsWith(".map")) yield p;
  }
}

const problems = [];
const checked = [];
const skipped = [];

for (const t of TARGETS) {
  if (![...t.maps, ...t.code].some((d) => existsSync(join(root, d)))) {
    skipped.push(t);
    continue;
  }
  checked.push(t.name);

  // ── 0. The desktop exception: read the APP back, if it has already been packaged ───
  if (t.asarGuard) {
    for (const asar of asarFiles(join(root, t.asarGuard))) {
      const violations = findPackagingViolations(listPackage(asar));
      // ONE problem per asar, grouped: a leak counts in hundreds of entries, and unrolling
      // them would drown the diagnosis in its own volume.
      if (violations.length > 0) {
        problems.push({
          target: t.name,
          msg: `${relative(root, asar)} — ${violations.length} forbidden entr(y/ies):\n${formatViolations(violations)}`,
        });
      }
    }
  }

  // ── 1. Aucune sourcemap ────────────────────────────────────────────────────
  for (const dir of t.maps) {
    for (const file of mapFiles(join(root, dir))) {
      const rel = relative(root, file);
      let detail = "";
      try {
        const m = JSON.parse(readFileSync(file, "utf8"));
        if (Array.isArray(m.sourcesContent) && m.sourcesContent.some(Boolean)) {
          detail = ` — contains the SOURCE of ${m.sourcesContent.filter(Boolean).length} file(s)`;
        }
      } catch {
        /* an unreadable .map is still one .map too many */
      }
      problems.push({ target: t.name, msg: `sourcemap shipped: ${rel}${detail}` });
    }
  }

  // ── 2. No sourcemap reference, and a properly minified bundle ──────────────
  for (const dir of t.code) {
    for (const file of jsFiles(join(root, dir))) {
      const text = readFileSync(file, "utf8");
      const rel = relative(root, file);

      if (text.includes("sourceMappingURL=data:")) {
        problems.push({ target: t.name, msg: `INLINE sourcemap (data:) in ${rel}` });
      } else if (/[#@]\s*sourceMappingURL=/.test(text)) {
        problems.push({ target: t.name, msg: `sourcemap reference in ${rel}` });
      }

      if (text.length < MIN_BYTES) continue;
      const perLine = text.length / text.split("\n").length;
      if (perLine < MIN_BYTES_PER_LINE) {
        problems.push({
          target: t.name,
          msg:
            `${rel} is not minified — ${Math.round(perLine)} bytes/line ` +
            `(plancher ${MIN_BYTES_PER_LINE})`,
        });
      }
    }
  }
}

if (requireAll && skipped.length) {
  for (const t of skipped) {
    problems.push({ target: t.name, msg: `not built (--require-all) — run: ${t.build}` });
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s) in the shipped bundles:\n`);
  for (const p of problems) console.error(`    [${p.target}] ${p.msg}`);
  console.error(
    "\n  A sourcemap embeds `sourcesContent`, hence the original TypeScript, comments\n" +
      "  included. Desktop produces its own as `hidden`, and it is electron-builder's `files`\n" +
      "  allowlist that keeps them out of the app — an allowlist READ BACK on the app.asar by\n" +
      "  apps/desktop/scripts/afterPack.cjs, not merely written in a YAML. The extension and\n" +
      "  mobile produce none (their delivery zips the whole folder).\n" +
      "  An app.asar already on disk and at fault predates the fix: rebuild it.\n",
  );
  process.exit(1);
}

const suffix = skipped.length ? ` (not built, skipped: ${skipped.map((t) => t.name).join(", ")})` : "";
console.log(`✓ shipped bundles carry no sourcemap and no readable source: ${checked.join(", ") || "none"}${suffix}`);
