/**
 * THE macOS RELEASE, with both notarizations IN PARALLEL. electron-builder processes arches
 * one after another and Apple's wait is pure network, so notarization comes out of its
 * pipeline; signing stays sequential (CPU work, one temporary keychain).
 *
 *   1. `eb --dir` per arch, notarization DISABLED (fuses + `archPrune` still run in `afterPack`).
 *   2. `ditto` + `notarytool submit --wait` on both, IN PARALLEL.
 *   3. `stapler staple` each one BEFORE the distributables, or the dmg/zip carry no ticket
 *      and Gatekeeper must query Apple online.
 *   4. `eb --prepackaged` per arch → dmg + zip + blockmaps.
 *   5. The two partial `latest-mac.yml` are merged by `@openmasq/updates-manifest`.
 *
 * ⚠️ Everything goes through `pnpm run eb` (`eb.mjs` computes the Electron version and
 * refuses a non-pnpm runner). `OPENMASQ_MAC_RELEASE_DRY_RUN=1` prints the plan and exits.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { composeManifests } from "@openmasq/updates-manifest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shippedTriples, type EbConfigShape } from "./shippedTriples";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
const ROOT = join(DESKTOP, "..", "..");
const RELEASE = join(DESKTOP, "release");
const DRY = process.env.OPENMASQ_MAC_RELEASE_DRY_RUN === "1";
// The product name comes from the brand's one home (rule 9).
const BRAND = JSON.parse(readFileSync(join(ROOT, "packages", "branding", "branding.json"), "utf8")) as {
  name: string;
};

/** The arches, READ from electron-builder.cjs (rule 9: this list has only one home). */
export const macArches = (config?: EbConfigShape): string[] =>
  shippedTriples("mac", config).map((t) => t.split("-").slice(1).join("-"));

/** The Apple credentials. Absent ⇒ stop BEFORE packaging, not after paying for it. */
function requireNotarizationCreds(): { id: string; pwd: string; team: string } {
  const [id, pwd, team] = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"].map(
    (k) => process.env[k] ?? "",
  );
  if (!id || !pwd || !team) {
    console.error(
      "mac-release: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID sont requis.\n" +
        "    (electron-builder les lisait lui-même ; ici c'est nous qui appelons notarytool.)",
    );
    process.exit(1);
  }
  return { id, pwd, team };
}

/** Runs a command. Rejects on a nonzero code OR a signal: a killed child has no code, and
 *  reading that as a success would ship something non-notarized. */
function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
  if (DRY) {
    console.log(`  $ ${cmd} ${args.join(" ")}`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: opts.cwd ?? DESKTOP });
    child.on("error", (e) => reject(new Error(`${cmd}: ${e.message}`)));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args[0] ?? ""} → ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

/** An arch's app folder, VERIFIED with `lipo` rather than trusted to a folder name: a swap
 *  would deliver each processor the other's app, and no later step would catch it. */
async function appDirFor(arch: string): Promise<string> {
  const candidates = [join(RELEASE, `mac-${arch}`), join(RELEASE, "mac")];
  for (const dir of candidates) {
    const app = join(dir, `${BRAND.name}.app`);
    if (!existsSync(app)) continue;
    if (DRY) return app;
    const archs = await capture("lipo", ["-archs", join(app, "Contents", "MacOS", BRAND.name)]);
    if (archs.split(/\s+/).includes(arch === "x64" ? "x86_64" : arch)) return app;
  }
  throw new Error(`mac-release: aucune app ${arch} trouvée sous release/ (candidats : ${candidates.join(", ")})`);
}

function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} → ${code}`))));
  });
}

const eb = (args: string[]) => run("pnpm", ["run", "eb", ...args]);

async function main(version: string): Promise<void> {
  const arches = macArches();
  const creds = requireNotarizationCreds();
  console.log(`[mac-release] ${arches.length} arche(s) : ${arches.join(", ")} — version ${version}`);

  // ── 1. package + sign, WITHOUT notarizing ────────────────────────────────────────────
  console.log("[mac-release] 1/5 package + sign (notarization disabled)");
  for (const arch of arches) {
    await eb([
      "--dir",
      "--mac",
      `--${arch}`,
      "-c.mac.notarize=false",
      `-c.extraMetadata.version=${version}`,
    ]);
  }
  const apps = new Map<string, string>();
  for (const arch of arches) apps.set(arch, await appDirFor(arch));

  // An .app without `app-update.yml` can NEVER update again (manual reinstall). Refuse
  // HERE, before paying for notarization. `afterPack.cjs` writes it.
  for (const arch of arches) {
    const yml = join(apps.get(arch)!, "Contents", "Resources", "app-update.yml");
    if (!DRY && !existsSync(yml)) {
      throw new Error(
        `mac-release: app-update.yml manquant dans l'app ${arch} (${yml}) — ` +
          `un build livré ainsi ne peut plus se mettre à jour. afterPack.cjs doit l'écrire.`,
      );
    }
  }

  // ── 2. notarize BOTH in parallel ────────────────────────────────────────────────
  console.log("[mac-release] 2/5 notarize both arches IN PARALLEL (the wait is Apple's)");
  const started = Date.now();
  const submissions = arches.map(async (arch) => {
    const app = apps.get(arch)!;
    const zip = join(RELEASE, `notarize-${arch}.zip`);
    // notarytool needs an archive, not a bare .app folder.
    await run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
    await run("xcrun", [
      "notarytool",
      "submit",
      zip,
      "--wait",
      "--apple-id",
      creds.id,
      "--password",
      creds.pwd,
      "--team-id",
      creds.team,
    ]);
    console.log(`[mac-release]   ${arch}: notarized`);
  });
  // `allSettled`: wait for EVERYTHING so both diagnoses survive, then fail if any failed.
  const results = await Promise.allSettled(submissions);
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${arches[i]} : ${r.reason}`] : []));
  if (failed.length > 0) {
    console.error(`mac-release: notarization failed —\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`[mac-release]   both notarizations took ${Math.round((Date.now() - started) / 1000)}s TOTAL`);

  // ── 3. staple BEFORE building anything at all ────────────────────────────────────────────
  console.log("[mac-release] 3/5 agrafage des tickets");
  for (const arch of arches) await run("xcrun", ["stapler", "staple", apps.get(arch)!]);

  // ── 4. dmg + zip from the stapled apps ─────────────────────────────────────────────
  console.log("[mac-release] 4/5 fabrication des distribuables");
  const manifests: string[] = [];
  for (const arch of arches) {
    await eb([
      "--prepackaged",
      apps.get(arch)!,
      "--mac",
      "dmg",
      "zip",
      `--${arch}`,
      `-c.extraMetadata.version=${version}`,
      "--publish",
      "never",
    ]);
    // Each pass rewrites `latest-mac.yml` with ONLY its own files: set it aside.
    const produced = join(RELEASE, "latest-mac.yml");
    const kept = join(RELEASE, `latest-mac.${arch}.yml`);
    if (!DRY) {
      if (!existsSync(produced)) throw new Error(`mac-release: ${produced} manquant après l'arche ${arch}`);
      renameSync(produced, kept);
    }
    manifests.push(kept);
  }

  // ── 5. a single manifest ──────────────────────────────────────────────────────────────
  // The manifest format has ONE home, `@openmasq/updates-manifest`, shared with the feed
  // that recomposes separately published legs (rule 9).
  console.log("[mac-release] 5/5 fusion des manifestes");
  writeFileSync(
    join(RELEASE, "latest-mac.yml"),
    composeManifests(manifests.map((m) => readFileSync(m, "utf8"))),
    "utf8",
  );
  console.log("[mac-release] terminé.");
}

// Nothing runs on IMPORT: the test loads this module for its one pure decision (which arches).
const invokedDirectly = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedDirectly) {
  const version = process.argv[2];
  if (!version) {
    console.error("mac-release: usage — tsx scripts/mac-release.ts <version>");
    process.exit(1);
  }
  if (DRY) console.log("[mac-release] ESSAI À BLANC — aucune commande n'est exécutée.\n");
  main(version).catch((e) => {
    console.error(`mac-release: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
