/**
 * Bake the Microsoft Visual C++ runtime DLLs next to the packaged app executable
 * (`apps/desktop/build/win-vcruntime/` → `electron-builder.cjs` `win.extraFiles`).
 *
 * WHY, mesuré et pas supposé : `@libsql/win32-x64-msvc/index.node` — le pilote de base,
 * chargé au DÉMARRAGE — importe `VCRUNTIME140.dll`, et `onnxruntime_binding.node` (NER
 * local + embeddings) importe en plus `MSVCP140.dll` et `VCRUNTIME140_1.dll`. Ces DLL
 * n'appartiennent PAS à Windows : elles arrivent avec le « Visual C++ Redistributable ».
 * Sur une machine qui ne l'a pas, Windows refuse le `dlopen` avec l'erreur 126 (« Le module
 * spécifié est introuvable » — qui désigne une DÉPENDANCE, pas le fichier), et l'app meurt
 * au lancement sur un dialogue Electron brut, avant qu'une seule ligne à nous ait tourné.
 *
 * La CI ne pouvait pas le voir : l'image `windows-latest` embarque Visual Studio, donc le
 * redistribuable. Il a fallu une VRAIE installation sur une machine vierge.
 *
 * POURQUOI LES EMBARQUER plutôt que faire installer le redistribuable par l'installeur :
 * `nsis.oneClick` + `perMachine: false` = installation par utilisateur SANS élévation, ce
 * qui est ce qui permet à l'auto-update de s'appliquer sans jamais interrompre. Le
 * redistribuable, lui, s'installe en administrateur : le poser en prérequis ramènerait une
 * UAC à l'installation ET à chaque mise à jour. Le déploiement « app-local » de ces DLL est
 * une option documentée par Microsoft, et c'est la seule cohérente avec cet installeur.
 *
 * D'OÙ ELLES VIENNENT, et ce que ça vaut. Microsoft livre ces DLL, pour ce déploiement
 * app-local précis, dans le dossier `VC\Redist\MSVC\<version>\x64\Microsoft.VC*.CRT\` de
 * Visual Studio. C'est cette source-là qu'on lit, sur le runner Windows qui l'a déjà.
 *
 * ⚠️ Ce qu'on N'A PAS pu faire, et pourquoi c'est écrit ici : partir de `VC_redist.x64.exe`
 * épinglé par sha256 aurait été mieux (une empreinte QU'ON choisit). L'installeur est un
 * bundle « burn » auto-contenu — `/layout` ne dépose rien (run 31501188537) et 7-Zip n'en
 * voit que le PE, sections et ressources, jamais les charges utiles (run 31502110203).
 * L'extraire demanderait `dark.exe` (WiX), absent des runners. L'intégrité ici est donc un
 * RELEVÉ, pas une porte : `integrity.json` enregistre le sha256 et la version de ce qui a
 * été embarqué, et le bake ÉCHOUE si la source est introuvable. Le jour où l'on veut une
 * vraie épingle, la suite est de VENDORER ces trois fichiers (comme `vendor/`), une fois.
 *
 * ⚠️ RÉSIDUEL À DIRE : servicing. Une copie embarquée ne reçoit pas les correctifs que
 * Windows Update applique au redistribuable central.
 *
 * ⚠️ WINDOWS-ONLY, et il SAUTE bruyamment ailleurs (comme `bake-win-jail.ts`) : la source
 * n'existe que là. La moitié fail-closed vit au RUNTIME, là où elle a un sens :
 * `src/main/db/driver.ts` transforme un chargement natif impossible en erreur lisible et
 * REMONTÉE, au lieu du dialogue brut.
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

/** Les trois DLL dont dépendent nos modules natifs, lues dans leurs tables d'imports PE.
 *  Une absente fait ÉCHOUER le bake : shipper deux tiers du runtime, c'est shipper un
 *  démarrage qui marche et un NER local qui tombe en silence. */
const WANTED = ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"];

const log = (m: string): void => console.log(`[bake:vcruntime] ${m}`);

/** Le chemin d'installation de Visual Studio, demandé à l'outil que Microsoft fournit pour
 *  ça (`vswhere`) — jamais un chemin en dur : l'édition (Enterprise/Community) et l'année
 *  changent d'une image de runner à l'autre. */
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

/** La version du redistribuable embarqué, pour le relevé — le nom du dossier `MSVC\<ver>\`
 *  la porte, et c'est la seule chose lisible sans parser les ressources du PE. */
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

  // On cherche les DLL PAR NOM sous les dossiers `x64\Microsoft.VC*.CRT` : ni la version du
  // toolset (`14.44.x`), ni le numéro de CRT (`VC143`) ne sont codés en dur — ils changent à
  // chaque mise à jour de l'image du runner.
  const all = (await walk(redistRoot)).filter((f) => /\\x64\\Microsoft\.VC\d+\.CRT\\/i.test(f));
  const record: Record<string, { sha256: string; version: string }> = {};
  const missing: string[] = [];

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const want of WANTED) {
    // Plusieurs versions du toolset peuvent cohabiter : on prend la plus récente par ordre
    // de chemin, ce qui trie correctement les `14.xx`.
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
