/**
 * Load `.env.development` + `.env.development.local` into the BUILDER's `process.env`
 * — under `electron-vite dev` ONLY.
 *
 * Why this exists: the defines in `buildDefines.ts` read `process.env.OPENMASQ_*` in
 * the config process, but Vite's own env loading stops at `import.meta.env` and the
 * `VITE_`/`MAIN_VITE_`… prefixes. So every un-prefixed variable `.env.development`
 * documents (connector ids, service addresses) was read from the shell alone — filling
 * the file did nothing, silently. This closes that gap where the file says it works.
 *
 * Two deliberate bounds:
 *  - **missing-only, shell first**: an exported variable outranks `.local`, which
 *    outranks `.env.development` — same precedence Vite gives its own files;
 *  - **never under `build`/`preview`**: a locally packaged release must not bake a
 *    dev override into a shipped bundle. `assertNoBakedBypass` still guards the
 *    bypass secret behind that, belt and braces.
 */
import { existsSync, readFileSync } from "node:fs";

/** KEY=VALUE lines; comments and blanks skipped; single/double quotes stripped. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Apply the files to `env`, missing keys only, `.local` first (it is the override). */
export function applyDevEnvFiles(
  env: Record<string, string | undefined>,
  files: string[],
): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [k, v] of Object.entries(parseEnvFile(readFileSync(file, "utf8")))) {
      if (env[k] === undefined) env[k] = v;
    }
  }
}

/** True iff this config run serves `electron-vite dev` (its default command). */
export function isDevCommand(argv: string[]): boolean {
  const cmd = argv[2];
  return cmd === undefined || cmd === "dev" || cmd.startsWith("-");
}
