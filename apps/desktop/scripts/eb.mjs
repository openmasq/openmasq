/**
 * The SINGLE entry point for packaging (`package` / `dist` / `release` / CI all go through
 * `pnpm run eb`). It computes `electronVersion` from the RESOLVED dependency and hands it to
 * electron-builder — see `electron-builder.cjs` for why that version is deliberately absent
 * from the config file.
 *
 * Why a node script and not the one-liner it replaces
 * (`electron-builder -c.electronVersion=$(node -p "…")`):
 *
 *  • `$(…)` is POSIX. pnpm runs package scripts through the platform shell, which on Windows
 *    is `cmd.exe` — there the substitution never happens and the LITERAL string
 *    `$(node -p "require('electron/package.json').version")` reaches electron-builder as the
 *    Electron version. That is the same failure mode the yml comment warns about (shipping a
 *    runtime nobody chose), except it can't even be spotted by reading the config.
 *
 *  • The `.bin/electron-builder` shim is a `.cmd` batch file on Windows and can't be spawned
 *    the same way as its POSIX sibling. We resolve electron-builder's own JS entry from its
 *    `package.json` `bin` field and run it with `process.execPath`, which behaves identically
 *    on both platforms.
 *
 * ⚠️ Must be invoked through pnpm. electron-builder picks its dependency collector from the
 * RUNNER's user agent, not from the lockfile: under npm it resolves nothing ("cannot find
 * path for dependency … @undefined") and ships an app whose node_modules holds two packages.
 * That used to be a comment; here it is a hard failure, checked below.
 *
 * `OPENMASQ_EB_DRY_RUN=1` prints the exact argv and exits 0 without packaging — how you check
 * what this resolves to (and how its test asserts the computed version) without a 20-minute
 * build.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/** The Electron version the app will actually SHIP, read off the installed dependency. */
function electronVersion() {
  const pkg = require.resolve("electron/package.json");
  return JSON.parse(readFileSync(pkg, "utf8")).version;
}

/** electron-builder's JS entry — never the `.bin` shim (a `.cmd` batch file on Windows). */
function electronBuilderCli() {
  const manifestPath = require.resolve("electron-builder/package.json");
  const { bin } = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = typeof bin === "string" ? bin : bin?.["electron-builder"];
  if (!entry) throw new Error("electron-builder exposes no `electron-builder` bin entry");
  return resolve(dirname(manifestPath), entry);
}

const agent = process.env.npm_config_user_agent ?? "";
if (!agent.startsWith("pnpm")) {
  console.error(
    "eb: refusing to package outside pnpm (user agent: " +
      (agent || "<none>") +
      ").\n" +
      "    electron-builder collects the app's node_modules using the RUNNER's package\n" +
      "    manager; under npm/yarn it resolves almost nothing and ships a broken tree.\n" +
      "    Use: pnpm run eb <flags>   (no `--` before the flags — pnpm forwards it literally)",
  );
  process.exit(1);
}

// The package's `name` (`@openmasq/desktop`) is NOT a product name, and NSIS uses it
// for the per-user install folder: the first Windows install landed
// in `AppData\Local\Programs\@openmasqdesktop`. It's also what Electron reads for
// `userData` when no `productName` is present in the packaged package.json — so,
// the place where conversations, vault and keys live.
//
// ⚠️ Fixing it is FREE as long as nothing has shipped on Windows, and costly afterward:
// after a first release, changing this name would move the data folder and
// lose installed users' conversations. macOS is not affected (its name comes from the
// Info.plist's CFBundleName, i.e. `productName`), so nothing moves for macs already
// out there. The `extraMetadata` (name/productName/author, derived from the brand) lives in
// `electron-builder.cjs` — passed as an EXPLICIT `--config` here so that ALL
// packaging paths have it — `package`, `dist`, `release` and CI all go through this script.
const argv = [
  electronBuilderCli(),
  "--config",
  "electron-builder.cjs",
  `-c.electronVersion=${electronVersion()}`,
  ...process.argv.slice(2),
];

if (process.env.OPENMASQ_EB_DRY_RUN === "1") {
  console.log(JSON.stringify({ node: process.execPath, argv }, null, 2));
  process.exit(0);
}

const child = spawn(process.execPath, argv, { stdio: "inherit" });
child.on("error", (err) => {
  console.error(`eb: failed to spawn electron-builder — ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  // A signalled child has no exit code; surface it as a non-zero status either way so a
  // killed build can never read as success.
  process.exit(code ?? (signal ? 1 : 0));
});
