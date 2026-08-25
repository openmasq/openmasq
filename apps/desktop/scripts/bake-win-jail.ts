/**
 * Build the Windows jail launcher (`<slug>-jail.exe`, name derived from the branding
 * package) into `apps/desktop/build/win-jail/`, laid down by `electron-builder.cjs` `win.extraResources`
 * → `${resourcesPath}/win-jail` and resolved at runtime by `src/main/python/sandbox.ts`
 * (`winJailExe`).
 *
 * Unlike the other bakes there is NOTHING to download and nothing to sha256-verify against
 * an upstream: the source is `apps/desktop/native/win-jail/`, ours, in this repo. Integrity
 * here means REPRODUCIBILITY, not provenance — the `Cargo.lock` beside it pins the one
 * dependency (Microsoft's `windows-sys`), and the digest written to `integrity.json` is a
 * record of what this build produced, not a gate.
 *
 * ⚠️ WINDOWS-ONLY, and it SKIPS loudly elsewhere rather than failing. `pnpm bake` runs on
 * macOS for every mac release, and a hard failure there would block a build that has no use
 * for this binary. The fail-closed half lives where it belongs — at RUNTIME: a Windows
 * bundle without the launcher reports `jailAvailability() === "none"` and `runPython`
 * refuses to run anything. A missing binary can therefore never mean "run unconfined"; it
 * only ever means "no interpreter on this build".
 *
 * Run: `pnpm --filter @openmasq/desktop bake:jail` (part of `pnpm bake`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
const CRATE = join(DESKTOP, "native", "win-jail");
const OUT = join(DESKTOP, "build", "win-jail");
// La marque n'a qu'une maison (règle 9) — le nom du binaire expédié en dérive.
const BRAND = JSON.parse(
  readFileSync(join(DESKTOP, "..", "..", "packages", "branding", "branding.json"), "utf8"),
) as { slug: string };

const log = (m: string): void => console.log(`[bake:jail] ${m}`);

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    log(`skip — the launcher only builds on Windows (host: ${process.platform}).`);
    log("  A macOS/Linux bundle needs no jail launcher; those platforms have sandbox-exec / bwrap.");
    return;
  }

  // `--locked` refuses to touch Cargo.lock, so the build uses EXACTLY the pinned
  // dependency versions — the point of committing the lock at all. It is conditional only
  // because the lock cannot exist before the very first build on a Windows machine (no
  // cargo on the macOS dev box that authored the crate); the first run generates it, CI
  // prints it, and it is committed. Once present, this branch never runs again — and a
  // build WITHOUT the pin says so loudly rather than passing quietly.
  const locked = existsSync(join(CRATE, "Cargo.lock"));
  if (!locked) {
    log("⚠️  no Cargo.lock — resolving dependencies fresh. Commit the generated lock:");
    log("    the build is NOT pinned until you do.");
  }
  log(`cargo build --release${locked ? " --locked" : ""}`);
  const r = spawnSync("cargo", ["build", "--release", ...(locked ? ["--locked"] : [])], {
    cwd: CRATE,
    stdio: "inherit",
  });
  if (r.error) throw new Error(`cargo not found — install the Rust toolchain: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`cargo build failed (exit ${r.status})`);

  // Le crate est neutre (`openmasq-jail`) ; le binaire EXPÉDIÉ garde son nom de marque
  // (`<slug>-jail.exe`) — c'est ce que `winJail.ts` résout dans le bundle installé.
  const exeName = `${BRAND.slug}-jail.exe`;
  const built = join(CRATE, "target", "release", "openmasq-jail.exe");
  await mkdir(OUT, { recursive: true });
  const dest = join(OUT, exeName);
  await copyFile(built, dest);

  const sha256 = createHash("sha256").update(await readFile(dest)).digest("hex");
  await writeFile(join(OUT, "integrity.json"), `${JSON.stringify({ [exeName]: sha256 }, null, 2)}\n`);
  log(`built ${dest}`);
  log(`sha256 ${sha256}`);
}

main().catch((e) => {
  console.error(`[bake:jail] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
