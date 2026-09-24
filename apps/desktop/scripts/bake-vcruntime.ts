/**
 * Bake the Visual C++ runtime DLLs next to the packaged exe (`build/win-vcruntime/` →
 * `electron-builder.cjs` `win.extraFiles`). The DB driver and the ONNX binding import them,
 * and they do NOT belong to Windows: without the Redistributable the app dies at launch on
 * a raw dialog (error 126). Bundled app-local (a Microsoft-documented deployment) because
 * the per-user, no-UAC installer cannot install the Redistributable itself.
 *
 * Source: Visual Studio's `VC\Redist\MSVC\<version>\x64\Microsoft.VC*.CRT\`, on the
 * Windows runner. ⚠️ Integrity is a RECORD, not a gate: the redistributable installer is a
 * burn bundle we cannot extract on the runners, so `integrity.json` records the sha256 and
 * version of what was bundled and the bake FAILS if the source is missing. A real pin means
 * VENDORING the three files. RESIDUAL: a bundled copy receives no Windows Update servicing.
 *
 * WINDOWS-ONLY, LOUDLY skipped elsewhere; the fail-closed half is `src/main/db/driver.ts`.
 * Run: `pnpm --filter @openmasq/desktop bake:vcruntime` (part of `pnpm bake`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", "win-vcruntime");

/** The three DLLs our native modules import. A missing one FAILS the bake: two thirds of
 *  the runtime is a startup that works and a local NER that falls over silently. */
const WANTED = ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"];

const log = (m: string): void => console.log(`[bake:vcruntime] ${m}`);

/** Visual Studio's install path via `vswhere`, never hardcoded (edition and year change). */
function vsInstallPath(): string | null {
  const vswhere = join(
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const r = spawnSync(vswhere, ["-latest", "-products", "*", "-property", "installationPath"], {
    encoding: "utf8",
  });
  const out = (r.stdout || "").trim().split(/\r?\n/)[0];
  return r.status === 0 && out ? out : null;
}

/** Every file under `dir`, recursively (tolerant: an unreadable branch is skipped). */
async function walk(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) found.push(...(await walk(abs)));
    else found.push(abs);
  }
  return found;
}

/** The redistributable's version, from the `MSVC\<ver>\` folder name. */
function versionFromPath(p: string): string {
  const m = /\\MSVC\\([^\\]+)\\/i.exec(p);
  return m ? m[1] : "inconnue";
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    log("non-Windows host — SKIPPED (the source only exists there).");
    log("La garde fail-closed est au runtime : src/main/db/driver.ts.");
    return;
  }

  const vs = vsInstallPath();
  if (!vs) throw new Error("Visual Studio not found (vswhere) — no Redist folder to read");
  const redistRoot = join(vs, "VC", "Redist", "MSVC");
  log(`source : ${redistRoot}`);

  // BY NAME under `x64\Microsoft.VC*.CRT`: neither the toolset version nor the CRT number
  // is hardcoded.
  const all = (await walk(redistRoot)).filter((f) => /\\x64\\Microsoft\.VC\d+\.CRT\\/i.test(f));
  const record: Record<string, { sha256: string; version: string }> = {};
  const missing: string[] = [];

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const want of WANTED) {
    // Several toolset versions can coexist: the most recent by path order.
    const hits = all.filter((f) => f.toLowerCase().endsWith(`\\${want}`)).sort();
    const hit = hits[hits.length - 1];
    if (!hit) {
      missing.push(want);
      continue;
    }
    const bytes = await readFile(hit);
    record[want] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      version: versionFromPath(hit),
    };
    await writeFile(join(OUT, want), bytes);
    log(`${want} — ${(bytes.length / 1024).toFixed(0)} KB (redist ${record[want].version})`);
  }

  if (missing.length > 0) {
    console.error(`\n[bake:vcruntime] missing: ${missing.join(", ")}`);
    console.error(`[bake:vcruntime] ${all.length} fichiers vus sous le Redist, échantillon :`);
    for (const f of all.slice(0, 30)) console.error(`    ${f.slice(redistRoot.length + 1)}`);
    throw new Error(`DLL manquantes dans le Redist de Visual Studio : ${missing.join(", ")}`);
  }

  await writeFile(
    join(OUT, "integrity.json"),
    `${JSON.stringify({ source: redistRoot, files: record }, null, 2)}\n`,
    "utf8",
  );
  log(`done → ${OUT}`);
}

main().catch((e) => {
  console.error(`[bake:vcruntime] ${e.message}`);
  process.exit(1);
});
