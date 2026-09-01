// The ANTI-MINE gate for the main/preload bundle — wired into `build`, so no path
// to a deployment bypasses it (CI, release, local build: same command).
//
// The class of bug it forbids: an uninstalled OPTIONAL PEER (linkedom's
// `canvas`) that vite replaces with a module that THROWS unconditionally —
// `__viteOptionalPeerDep_…` / "Could not resolve 'x' imported by 'y'" — hoisted out
// of the original try/catch. The build SUCCEEDS, the app dies on load: invisible
// before the first real launch, i.e. after deployment. Here, every
// mine found is a build failure, with the decision to make (alias to a stub,
// or external) pointed out in the message.
//
// Scope: out/main + out/preload (loaded at boot or on first use — a mine
// in a lazy chunk is a pulled-pin grenade, not a lesser evil). The
// renderer has its own regime (CSP, web imports) and doesn't emit this shim.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = [join(root, "out", "main"), join(root, "out", "preload")];
// ⚠️ The bundle is MINIFIED (`electron.vite.config.ts`, `shipped`), and minification
// doesn't reach both signatures the same way — measured: esbuild renames
// `__viteOptionalPeerDep_…` to a single letter, so that signature is LOST on a shipped
// build; it's the `throw`'s string literal that carries the guard alone (a
// minifier doesn't rewrite a string's content). So never remove the second one
// thinking the first covers it: it's the opposite. The first is only useful on a
// non-minified build.
const SIGNATURES = ["__viteOptionalPeerDep_", 'Could not resolve "'];

function* jsFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (name.endsWith(".js") || name.endsWith(".cjs") || name.endsWith(".mjs")) yield p;
  }
}

const hits = [];
for (const dir of SCAN) {
  for (const file of jsFiles(dir)) {
    const text = readFileSync(file, "utf8");
    for (const sig of SIGNATURES) {
      let i = text.indexOf(sig);
      while (i >= 0) {
        // The offending line, bounded — enough to name the peer and the importer.
        const line = text.slice(Math.max(0, text.lastIndexOf("\n", i) + 1), text.indexOf("\n", i)).slice(0, 160);
        hits.push({ file: file.slice(root.length + 1), line });
        i = text.indexOf(sig, i + sig.length);
      }
    }
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} mine(s) de pair optionnel dans le bundle — l'app jettera au chargement :`);
  for (const h of hits) console.error(`    ${h.file}\n      ${h.line}`);
  console.error(
    "\n  Un pair optionnel bundlé devient un throw inconditionnel (le try/catch d'origine est" +
      "\n  court-circuité). Décidez explicitement : alias vers un stub (voir `canvas` dans" +
      "\n  electron.vite.config.ts) ou external + packagé. Ne supprimez jamais cette porte.\n",
  );
  process.exit(1);
}
console.log("✓ bundle main/preload sans mine de pair optionnel");
