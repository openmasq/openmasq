/**
 * Bake a BUNDLED, pruned, sha256-verified Python runtime into
 * `apps/desktop/build/python-runtime/<os>-<arch>/`, laid down by `electron-builder.cjs`
 * `extraResources` and used read-only at runtime (see `src/main/python/runtime.ts`).
 *
 * Layout produced (NO venv — wheels install into the base CPython's site-packages, so the
 * tree is relocatable + runnable read-only in place):
 *   <out>/python/…            base python-build-standalone CPython + the pinned WHEELS
 *   <out>/fonts/SpaceGrotesk.ttf   brand font for matplotlib (no runtime fetch)
 *   <out>/manifest.json       { signature }
 *
 * Run: `pnpm --filter @openmasq/desktop bake:runtime` (defaults to the host triple;
 * override with `BAKE_TARGET=darwin-arm64`). Idempotent: skips when the manifest already
 * matches the current signature (pass `--force` to rebuild).
 *
 * ⚠️ `BAKE_TARGET` may name a machine this one is NOT (`darwin-x64` from an Apple Silicon
 * runner). Wheels are then resolved by platform tag rather than by running the target
 * interpreter — see `installWheels` for why that is safe, and `assertArch` for the check
 * that makes it verified rather than assumed. One runner can therefore bake every mac
 * arch; Windows still needs a Windows runner for the REST of its packaging (NSIS, the
 * jail launcher), not for this.
 *
 * NB: this is a BUILD script (tsx), not app code — the >300 LOC rule targets shipped
 * ts/tsx; this stays well under it anyway.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import {
  TARBALL,
  TARBALL_SHA256,
  pbsUrl,
  SPACE_GROTESK_URL,
  SPACE_GROTESK_SHA256,
  isPruned,
  PRUNE_ROOT_DIRS,
  runtimeSignature,
} from "../src/main/python/runtimeSpec";
import { archOfTriple } from "../src/main/python/binaryArch";
import { assertArch, installWheels } from "./crossInstall";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
const host = `${process.platform}-${process.arch}`;
const target = process.env.BAKE_TARGET || host;
const force = process.argv.includes("--force");
const outDir = join(DESKTOP, "build", "python-runtime", target);
const isWin = target.startsWith("win32");
/** Baking for a machine we are NOT — the interpreter can't be run, so `crossInstall.ts`
 *  resolves the wheels by tag instead and re-reads the bytes it got. */
const cross = target !== host;

const log = (m: string): void => console.log(`[bake:runtime] ${m}`);
const exists = (p: string): Promise<boolean> => stat(p).then(() => true).catch(() => false);
const interpreter = (): string =>
  isWin ? join(outDir, "python", "python.exe") : join(outDir, "python", "bin", "python3");

/** Run a child to completion, inheriting stdio; throw on non-zero. */
function run(cmd: string, args: string[], cwd?: string): void {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} → exit ${r.status}`);
}

/** Stream-download `url` to `dest`, returning the sha256 of the bytes written. */
async function download(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status}): ${url}`);
  const out = createWriteStream(dest);
  const hash = createHash("sha256");
  for await (const chunk of Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])) {
    hash.update(chunk as Buffer);
    if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  // Flush + close BEFORE returning, so a consumer (tar) never reads a truncated file.
  await new Promise<void>((resolve, reject) => {
    out.on("error", reject).on("finish", () => resolve());
    out.end();
  });
  return hash.digest("hex");
}

/** The base CPython's site-packages (e.g. python/lib/python3.12/site-packages). */
async function sitePackages(): Promise<string> {
  if (isWin) return join(outDir, "python", "Lib", "site-packages");
  const lib = join(outDir, "python", "lib");
  const dirs = await readdir(lib);
  const py = dirs.find((d) => d.startsWith("python3"));
  if (!py) throw new Error(`no python3.x dir under ${lib}`);
  return join(lib, py, "site-packages");
}

/** Recursively delete every path matching {@link isPruned}, reporting the bytes saved. */
async function prune(sp: string): Promise<number> {
  let saved = 0;
  async function walk(abs: string, rel: string): Promise<void> {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = join(abs, e.name);
      if (isPruned(childRel)) {
        saved += await dirSize(childAbs);
        await rm(childAbs, { recursive: true, force: true });
        continue;
      }
      if (e.isDirectory()) await walk(childAbs, childRel);
    }
  }
  await walk(sp, "");
  return saved;
}

/** Delete whole {@link PRUNE_ROOT_DIRS} entries (python-root-relative; outside
 *  site-packages, so `prune`/`isPruned` can't reach them). Returns bytes saved. */
async function pruneRootDirs(): Promise<number> {
  const pyRoot = join(outDir, "python");
  let saved = 0;
  for (const rel of PRUNE_ROOT_DIRS) {
    const abs = join(pyRoot, ...rel.split("/"));
    const bytes = await dirSize(abs);
    if (bytes === 0) continue; // absent → nothing to remove
    saved += bytes;
    await rm(abs, { recursive: true, force: true });
  }
  return saved;
}

async function dirSize(p: string): Promise<number> {
  const s = await stat(p).catch(() => null);
  if (!s) return 0;
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const e of await readdir(p)) total += await dirSize(join(p, e));
  return total;
}

async function main(): Promise<void> {
  const name = TARBALL[target];
  const wantSha = TARBALL_SHA256[target];
  if (!name || !wantSha) throw new Error(`unsupported BAKE_TARGET: ${target}`);
  const sig = runtimeSignature();

  const manifestPath = join(outDir, "manifest.json");
  if (!force && (await exists(manifestPath))) {
    const prev = JSON.parse(await readFile(manifestPath, "utf8")).signature;
    if (prev === sig && (await exists(interpreter()))) {
      log(`up to date (${sig}) — skipping. Pass --force to rebuild.`);
      return;
    }
  }

  log(`baking ${target} (${sig})`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const tgz = join(outDir, "dl.tar.gz");
  log(`downloading ${name}`);
  const gotSha = await download(pbsUrl(name), tgz);
  if (gotSha !== wantSha) throw new Error(`sha256 mismatch for ${name}: got ${gotSha}`);
  log("sha256 OK");

  // → <out>/python/. Le nom d'archive est RELATIF et l'extraction se fait depuis `outDir`,
  // jamais un chemin absolu : le `tar` de git-bash est GNU tar, qui lit un `-f` contenant
  // deux-points comme un hôte DISTANT (`host:chemin`, syntaxe rsh). Un chemin Windows part
  // donc en « Cannot connect to D: resolve failed », puis « unexpected end of file » sur un
  // gzip qui n'a rien reçu. `--force-local` corrigerait GNU tar mais casserait le bsdtar de
  // Windows, qui ne connaît pas ce drapeau — un nom relatif convient aux deux, partout.
  run("tar", ["-xzf", "dl.tar.gz"], outDir);
  await rm(tgz, { force: true });

  const sp = await sitePackages();
  log(cross ? `pip install CROSS ${host} → ${target}` : "pip install (base site-packages, no venv)");
  installWheels(sp, target, cross ? null : interpreter());

  // The bytes, not the tags (cross bake). Native bakes get it too — it costs one header
  // read per module and would have caught a mismatched prebuilt just as well.
  const wantArch = archOfTriple(target);
  if (wantArch) log(`arch OK: ${await assertArch(sp, wantArch, isWin)} native modules are ${wantArch}`);

  const savedBytes = (await prune(sp)) + (await pruneRootDirs());
  log(`pruned ${(savedBytes / 1024 / 1024).toFixed(0)} MB (tests/pip)`);

  log("fetching brand font");
  await mkdir(join(outDir, "fonts"), { recursive: true });
  try {
    const fontSha = await download(SPACE_GROTESK_URL, join(outDir, "fonts", "SpaceGrotesk.ttf"));
    // A sha256 MISMATCH is a supply-chain tamper → FATAL (never bundle it). A network FAILURE
    // stays non-fatal (the brand font is cosmetic; matplotlib falls back to a default face).
    if (fontSha !== SPACE_GROTESK_SHA256) {
      throw new Error(`font sha256 mismatch: got ${fontSha}, want ${SPACE_GROTESK_SHA256}`);
    }
    log("font sha256 OK");
  } catch (e) {
    const msg = (e as Error).message;
    if (/sha256 mismatch/.test(msg)) throw e;
    log(`font fetch failed (non-fatal): ${msg}`);
  }

  await writeFile(manifestPath, `${JSON.stringify({ signature: sig, target }, null, 2)}\n`, "utf8");
  const totalMb = ((await dirSize(join(outDir, "python"))) / 1024 / 1024).toFixed(0);
  log(`done → ${outDir} (python ${totalMb} MB on disk)`);
}

main().catch((e) => {
  console.error(`[bake:runtime] ${e.message}`);
  process.exit(1);
});
