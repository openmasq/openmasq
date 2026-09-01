/**
 * Bake the Microsoft Visual C++ runtime DLLs next to the packaged app executable
 * (`apps/desktop/build/win-vcruntime/` → `electron-builder.cjs` `win.extraFiles`).
 *
 * WHY, measured and not assumed: `@libsql/win32-x64-msvc/index.node` — the database driver,
 * loaded at STARTUP — imports `VCRUNTIME140.dll`, and `onnxruntime_binding.node` (local NER
 * + embeddings) additionally imports `MSVCP140.dll` and `VCRUNTIME140_1.dll`. These DLLs
 * do NOT belong to Windows: they arrive with the "Visual C++ Redistributable".
 * On a machine without it, Windows refuses the `dlopen` with error 126 ("The specified
 * module could not be found" — which names a DEPENDENCY, not the file), and the app dies
 * at launch on a raw Electron dialog, before a single line of ours has run.
 *
 * CI couldn't see it: the `windows-latest` image embeds Visual Studio, hence the
 * redistributable. It took a REAL install on a clean machine.
 *
 * WHY BUNDLE THEM rather than have the installer install the redistributable:
 * `nsis.oneClick` + `perMachine: false` = per-user install WITHOUT elevation, which
 * is what lets auto-update apply without ever interrupting. The
 * redistributable, on the other hand, installs as administrator: making it a prerequisite would bring back a
 * UAC prompt at install AND on every update. The "app-local" deployment of these DLLs is
 * an option documented by Microsoft, and it's the only one consistent with this installer.
 *
 * WHERE THEY COME FROM, and what that's worth. Microsoft ships these DLLs, for this exact
 * app-local deployment, in the `VC\Redist\MSVC\<version>\x64\Microsoft.VC*.CRT\` folder of
 * Visual Studio. That's the source we read, on the Windows runner that already has it.
 *
 * ⚠️ What we could NOT do, and why it's written here: starting from `VC_redist.x64.exe`
 * pinned by sha256 would have been better (a fingerprint WE choose). The installer is a
 * self-contained "burn" bundle — `/layout` drops nothing (run 31501188537) and 7-Zip only
 * sees the PE, sections and resources, never the payloads (run 31502110203).
 * Extracting it would require `dark.exe` (WiX), absent from the runners. Integrity here is therefore a
 * RECORD, not a gate: `integrity.json` records the sha256 and the version of what was
 * bundled, and the bake FAILS if the source can't be found. The day we want a
 * real pin, the next step is to VENDOR these three files (like `vendor/`), once.
 *
 * ⚠️ RESIDUAL to state: servicing. A bundled copy doesn't receive the patches
 * Windows Update applies to the central redistributable.
 *
 * ⚠️ WINDOWS-ONLY, and it LOUDLY skips elsewhere (like `bake-win-jail.ts`): the source
 * only exists there. The fail-closed half lives at RUNTIME, where it makes sense:
 * `src/main/db/driver.ts` turns an impossible native load into a readable and
 * SURFACED error, instead of the raw dialog.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:vcruntime` (part of `pnpm bake`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", "win-vcruntime");

/** The three DLLs our native modules depend on, read from their PE import tables.
 *  A missing one FAILS the bake: shipping two thirds of the runtime means shipping a
 *  startup that works and a local NER that falls over silently. */
const WANTED = ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"];

const log = (m: string): void => console.log(`[bake:vcruntime] ${m}`);

/** Visual Studio's install path, asked from the tool Microsoft provides for
 *  this (`vswhere`) — never a hardcoded path: the edition (Enterprise/Community) and the year
 *  change from one runner image to the next. */
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

/** The bundled redistributable's version, for the record — the `MSVC\<ver>\` folder name
 *  carries it, and it's the only thing readable without parsing the PE's resources. */
function versionFromPath(p: string): string {
  const m = /\\MSVC\\([^\\]+)\\/i.exec(p);
  return m ? m[1] : "inconnue";
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    log("hôte non-Windows — SAUTÉ (la source n'existe que là).");
    log("La garde fail-closed est au runtime : src/main/db/driver.ts.");
    return;
  }

  const vs = vsInstallPath();
  if (!vs) throw new Error("Visual Studio introuvable (vswhere) — pas de dossier Redist à lire");
  const redistRoot = join(vs, "VC", "Redist", "MSVC");
  log(`source : ${redistRoot}`);

  // We look for the DLLs BY NAME under the `x64\Microsoft.VC*.CRT` folders: neither the
  // toolset version (`14.44.x`), nor the CRT number (`VC143`) are hardcoded — they change on
  // every runner image update.
  const all = (await walk(redistRoot)).filter((f) => /\\x64\\Microsoft\.VC\d+\.CRT\\/i.test(f));
  const record: Record<string, { sha256: string; version: string }> = {};
  const missing: string[] = [];

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const want of WANTED) {
    // Several toolset versions can coexist: we take the most recent by path
    // order, which correctly sorts the `14.xx` ones.
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
    log(`${want} — ${(bytes.length / 1024).toFixed(0)} Ko (redist ${record[want].version})`);
  }

  if (missing.length > 0) {
    console.error(`\n[bake:vcruntime] introuvables : ${missing.join(", ")}`);
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
