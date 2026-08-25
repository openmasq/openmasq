import { dirname, join, sep } from "node:path";

// ── Running bundled npm-package MCP servers without npx ───────────────────────
// A packaged Electron app has NO `npx`/node on PATH, so a stdio catalog entry
// declared as `npx -y <pkg>` fails with `spawn npx ENOENT` once installed. Instead
// we DECLARE those servers as real dependencies (bundled + asarUnpack'd) and spawn
// them from their resolved bin via Electron's OWN Node (ELECTRON_RUN_AS_NODE) — no
// npx, no network. In dev without the dep it transparently falls back to npx.

/** Strip a trailing `@version` from a package spec, keeping any scope.
 *  `@playwright/mcp@0.0.77` → `@playwright/mcp`; `pkg@1.2.3` → `pkg`; bare → bare.
 *  (A leading `@` at index 0 is the scope marker, not a version separator.) */
function bareName(pkg: string): string {
  const at = pkg.lastIndexOf("@");
  return at > 0 ? pkg.slice(0, at) : pkg;
}

/** Resolve an installed package's executable JS entry (its `bin`, else `main`).
 *  Swaps the app.asar (virtual) path for the real app.asar.unpacked one so the
 *  path is spawnable. A trailing `@version` in `pkg` is ignored for resolution
 *  (the installed copy is pinned in package.json). Throws if not resolvable. */
export function resolveNodeBin(pkg: string): string {
  const pkgJsonPath = require.resolve(`${bareName(pkg)}/package.json`);
  const json = require(pkgJsonPath) as { bin?: string | Record<string, string>; main?: string };
  const rel =
    typeof json.bin === "string"
      ? json.bin
      : json.bin && typeof json.bin === "object"
        ? Object.values(json.bin)[0]
        : (json.main ?? "index.js");
  return join(dirname(pkgJsonPath), rel).replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  );
}

export interface NodeSpawn {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Turn a `{ command, args }` (as declared in the catalog) into a spawnable spec.
 *  For `npx -y <pkg> [rest…]` it resolves the BUNDLED package and runs it via
 *  Electron's Node; anything else is passed through unchanged. Falls back to the
 *  original npx command if the package can't be resolved (dev without the dep). */
export function nodeSpawnFor(command: string, args: string[]): NodeSpawn {
  if (command !== "npx") return { command, args };
  const pkgIdx = args.findIndex((a) => !a.startsWith("-")); // first non-flag = the package
  if (pkgIdx < 0) return { command, args };
  const pkg = args[pkgIdx];
  const rest = args.slice(pkgIdx + 1);
  try {
    return {
      command: process.execPath,
      args: [resolveNodeBin(pkg), ...rest],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } as Record<string, string>,
    };
  } catch {
    return { command, args };
  }
}
