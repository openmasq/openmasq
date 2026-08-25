import { app } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { WHEELS } from "./wheels";
import {
  TARBALL,
  TARBALL_SHA256,
  pbsUrl,
  runtimeSignature,
} from "./runtimeSpec";

/**
 * Python runtime manager.
 *
 * PACKAGED builds ship a **bundled, pruned, sha256-verified** CPython (baked by
 * `scripts/bake-python-runtime.ts`, laid down by `electron-builder.cjs` `extraResources`
 * into `${resourcesPath}/python-runtime`). There is NO venv — the pinned {@link WHEELS}
 * are installed straight into the base CPython's `site-packages`, so the tree is
 * relocatable and can be run **read-only in place** (the sandbox jail no longer grants
 * any write to it — see `sandbox.ts`). `ensureRuntime()` then does zero network I/O; it
 * only warms matplotlib's font cache into a WRITABLE userData dir.
 *
 * DEV (`pnpm dev`, no bundle present) falls back to a download-on-first-use install into
 * `${userData}/python`, mirroring the bundle layout (base CPython + wheels in its
 * site-packages, no venv). The tarball is sha256-verified against {@link TARBALL_SHA256}.
 */

const MAX_DL_BYTES = 120 * 1024 * 1024; // size cap on the runtime download (dev only)

export interface Progress {
  phase: "download" | "extract" | "install" | "ready";
  pct?: number;
}
type OnProgress = (p: Progress) => void;

const isWin = process.platform === "win32";

/** The bundled runtime dir shipped inside the app (`extraResources`), or "" in dev. */
const bundledRuntimeDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, "python-runtime") : "";

/** The dev download location (writable userData). */
const devRuntimeDir = (): string => join(app.getPath("userData"), "python");

/** Resolve the active runtime root: the bundled one if present, else the dev download. */
let resolvedDir: string | undefined;
export const runtimeDir = (): string => resolvedDir ?? devRuntimeDir();

/** The base CPython interpreter for a runtime root (no venv — wheels live in its own
 *  `site-packages`, which is on `sys.path` by default, so nothing else is needed). */
export const interpreterFor = (dir = runtimeDir()): string =>
  isWin ? join(dir, "python", "python.exe") : join(dir, "python", "bin", "python3");

/** Directory holding the brand font(s) matplotlib registers. Inside the runtime root
 *  (read-only in a bundle — matplotlib only READS it; see `wheels.ts` preamble). */
export const fontsDir = (dir = runtimeDir()): string => join(dir, "fonts");

/** PERSISTENT matplotlib config/cache dir (`fontlist-*.json`). ALWAYS under WRITABLE
 *  userData — decoupled from the runtime root, which may be a read-only bundle — and
 *  outside the per-run scratch (which is wiped each run), so the font cache is built ONCE
 *  ({@link warmMatplotlib}) and reused across sandbox runs. See `sandbox.ts`. */
export const mplConfigDir = (): string => join(app.getPath("userData"), "python-cache", "mpl");

const exists = (p: string): Promise<boolean> =>
  access(p).then(() => true).catch(() => false);

/** Run a child to completion; reject on non-zero. Output is captured (never inherited)
 *  so a pip failure surfaces a bounded message. */
function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}) });
    let err = "";
    child.stderr?.on("data", (d) => {
      err = (err + String(d)).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)),
    );
  });
}

/** Stream-download `url` to `dest` (dev only), aborting past {@link MAX_DL_BYTES}, and
 *  return the sha256 of the bytes written so the caller can verify integrity. */
async function download(url: string, dest: string, onProgress?: OnProgress): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Téléchargement du runtime Python échoué (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const out = createWriteStream(dest);
  const hash = createHash("sha256");
  let got = 0;
  try {
    for await (const chunk of Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])) {
      const buf = chunk as Buffer;
      got += buf.length;
      if (got > MAX_DL_BYTES) throw new Error("Runtime Python trop volumineux (dépasse la limite)");
      hash.update(buf);
      if (!out.write(buf)) await new Promise<void>((r) => out.once("drain", () => r()));
      if (total) onProgress?.({ phase: "download", pct: Math.round((got / total) * 100) });
    }
  } finally {
    // Flush + close BEFORE returning so tar never reads a truncated archive.
    await new Promise<void>((resolve, reject) => {
      out.on("error", reject).on("finish", () => resolve());
      out.end();
    });
  }
  return hash.digest("hex");
}

/** Build matplotlib's font cache ONCE, at TRUSTED time (un-jailed, no 60s timeout), into
 *  the PERSISTENT {@link mplConfigDir}. Without this the FIRST sandboxed plot pays a
 *  multi-second system-font scan under the jail, which on a cold machine overruns the
 *  timeout. Idempotent + cheap: skips (a bare `readdir`) once a `fontlist-*.json` exists,
 *  so it's safe on the hot path too. Best-effort — a failure just means the first run
 *  rebuilds the cache. */
async function warmMatplotlib(dir: string): Promise<void> {
  const cfg = mplConfigDir();
  try {
    await mkdir(cfg, { recursive: true });
    const cached = (await readdir(cfg).catch(() => [])).some((f) => f.startsWith("fontlist-"));
    if (cached) return;
    await run(
      interpreterFor(dir),
      ["-c", "import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt; plt.subplots()"],
      { ...process.env, MPLBACKEND: "Agg", MPLCONFIGDIR: cfg, OPENMASQ_FONT_DIR: fontsDir(dir) },
    );
  } catch {
    /* non-fatal — the first sandbox run will build the cache instead */
  }
}

let inFlight: Promise<{ pythonBin: string }> | undefined;

/** Ensure the runtime is ready, returning the interpreter. Idempotent and safe under
 *  concurrent calls (a single in-flight promise). */
export function ensureRuntime(onProgress?: OnProgress): Promise<{ pythonBin: string }> {
  if (!inFlight) {
    inFlight = build(onProgress).catch((e) => {
      inFlight = undefined; // let a later call retry after a failure
      throw e;
    });
  }
  return inFlight;
}

async function build(onProgress?: OnProgress): Promise<{ pythonBin: string }> {
  // 1) A bundled runtime? Use it in place, READ-ONLY. Zero network, no install.
  const bundle = bundledRuntimeDir();
  if (bundle && (await exists(interpreterFor(bundle)))) {
    resolvedDir = bundle;
    await warmMatplotlib(bundle); // writes into userData (mplConfigDir), not the bundle
    onProgress?.({ phase: "ready" });
    return { pythonBin: interpreterFor(bundle) };
  }

  // 2) Dev: download-on-first-use into userData (sha256-verified), mirroring the bundle
  //    layout (base CPython + wheels in its site-packages, NO venv).
  const dir = devRuntimeDir();
  resolvedDir = dir;
  const py = interpreterFor(dir);
  const sig = runtimeSignature();
  if ((await exists(join(dir, ".ready"))) && (await exists(py))) {
    const prev = await readFile(join(dir, ".ready"), "utf8").then((s) => s.trim()).catch(() => "");
    if (prev === sig) {
      await warmMatplotlib(dir);
      return { pythonBin: py };
    }
    // Pinned wheels changed — top up the existing base interpreter (pip is idempotent).
    onProgress?.({ phase: "install" });
    await run(py, ["-m", "pip", "install", "--no-input", "--only-binary=:all:", ...WHEELS]);
    await writeFile(join(dir, ".ready"), `${sig}\n`, "utf8");
    onProgress?.({ phase: "ready" });
    return { pythonBin: py };
  }

  const name = TARBALL[`${process.platform}-${process.arch}`];
  const wantSha = TARBALL_SHA256[`${process.platform}-${process.arch}`];
  if (!name || !wantSha) {
    throw new Error(`Plateforme non supportée pour le runtime Python : ${process.platform}-${process.arch}`);
  }
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });

  const tgz = join(dir, "dl.tar.gz");
  onProgress?.({ phase: "download" });
  const gotSha = await download(pbsUrl(name), tgz, onProgress);
  if (gotSha !== wantSha) {
    await rm(tgz, { force: true }).catch(() => {});
    throw new Error("Intégrité du runtime Python invalide (sha256) — téléchargement rejeté.");
  }

  onProgress?.({ phase: "extract" });
  await run("tar", ["-xzf", tgz, "-C", dir]); // bsdtar ships on Win10+, macOS, linux
  await rm(tgz, { force: true }).catch(() => {});

  // Install the wheels straight into the base CPython's site-packages (no venv).
  onProgress?.({ phase: "install" });
  await run(py, ["-m", "pip", "install", "--no-input", "--only-binary=:all:", ...WHEELS]);

  await warmMatplotlib(dir);
  await writeFile(join(dir, ".ready"), `${sig}\n`, "utf8");
  onProgress?.({ phase: "ready" });
  return { pythonBin: py };
}
