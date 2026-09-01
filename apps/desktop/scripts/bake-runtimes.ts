/**
 * Bake the Python runtime for EVERY arch this platform ships.
 *
 * `bake-python-runtime.ts` does ONE triple (the host's, or `BAKE_TARGET`). Since mac
 * started shipping two arches, sticking to the host leaves `build/python-runtime/darwin-x64` empty —
 * yet `extraResources` claims it at packaging time. This is the loop that was missing, and it
 * lives here rather than in the workflow: `pnpm run release` on a machine must produce
 * exactly what CI produces, or the two release paths diverge (rule 9).
 *
 * Idempotent: an already-baked triple is skipped on its signature, so running it again costs nothing.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentBlock, shippedTriples } from "./shippedTriples";

const HERE = dirname(fileURLToPath(import.meta.url));
const triples = shippedTriples(currentBlock());
const passthrough = process.argv.slice(2); // `--force` in particular

// We relaunch the SAME runtime that is executing us (`execArgv` carries the TypeScript
// loader's flags), rather than going to fetch the `tsx` binary: no `.cmd` shim to
// work around on Windows, and no dependency on a package this app doesn't declare.
const relance = [...process.execArgv, join(HERE, "bake-python-runtime.ts"), ...passthrough];

console.log(`[bake:runtimes] ${triples.length} triple(s) à baker : ${triples.join(", ")}`);

for (const target of triples) {
  const r = spawnSync(process.execPath, relance, {
    stdio: "inherit",
    env: { ...process.env, BAKE_TARGET: target },
  });
  if (r.status !== 0) {
    // No "let's continue with the others": a missing runtime makes an app that installs
    // and whose Python execution doesn't work. Better to stop here than discover it there.
    console.error(`[bake:runtimes] échec sur ${target} → exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}
