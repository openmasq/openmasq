/**
 * LA RELEASE macOS, avec les deux notarisations EN PARALLÈLE.
 *
 * Pourquoi ce script existe. `electron-builder` traite les arches de bout en bout, l'une
 * après l'autre : empaquetage → signature → soumission à Apple → **attente** → agrafage →
 * dmg/zip, puis la même chose pour la seconde. L'attente d'Apple est du réseau pur, et on la
 * payait DEUX FOIS en série sur un runner macOS facturé au décuple. Mesuré en CI sur une
 * seule arche (run 123) : 21 min 55 pour cette étape, contre 58 s d'install et 49 s de build
 * — c'est 84 % du job, et ça double avec la seconde arche.
 *
 * Ce que ce script change, et RIEN d'autre : la notarisation sort du pipeline
 * d'electron-builder pour que les deux soumissions attendent ENSEMBLE. La signature reste
 * séquentielle (c'est du CPU, la paralléliser sur un runner à 3 cœurs ne gagne rien et
 * ferait courir deux imports de certificat sur le même trousseau temporaire).
 *
 *   1. `eb --dir` par arche, notarisation DÉSACTIVÉE → deux .app signés, fuses posés,
 *      `archPrune` passé (il tourne dans `afterPack`, donc rien de ce garde n'est perdu).
 *   2. `ditto` + `notarytool submit --wait` sur les deux, EN PARALLÈLE.
 *   3. `stapler staple` chacun — AVANT la fabrication des distribuables, sans quoi le zip et
 *      le dmg téléchargés ne porteraient pas le ticket et Gatekeeper devrait interroger
 *      Apple en ligne (donc : échec hors ligne, chez l'utilisateur).
 *   4. `eb --prepackaged` par arche → dmg + zip + blockmaps, depuis les apps agrafées.
 *   5. Les deux `latest-mac.yml` partiels sont fusionnés en un seul, par le SEUL code qui
 *      sait le faire (`apps/updates`, à qui ce format appartient) — voir plus bas.
 *
 * ⚠️ Tout passe par `pnpm run eb`, jamais `electron-builder` en direct : `eb.mjs` calcule la
 * version d'Electron depuis la dépendance résolue et refuse un lanceur non-pnpm. Sortir de
 * ce chemin, c'est réintroduire les deux pannes qu'il existe pour empêcher.
 *
 * `OPENMASQ_MAC_RELEASE_DRY_RUN=1` imprime le plan (toutes les commandes, dans l'ordre) et
 * sort sans rien exécuter — comment on relit ce fichier sans payer 40 minutes de build.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shippedTriples, type EbConfigShape } from "./shippedTriples";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
const ROOT = join(DESKTOP, "..", "..");
const RELEASE = join(DESKTOP, "release");
const DRY = process.env.OPENMASQ_MAC_RELEASE_DRY_RUN === "1";
// Le nom du produit vient de la seule maison de la marque (règle 9).
const BRAND = JSON.parse(readFileSync(join(ROOT, "packages", "branding", "branding.json"), "utf8")) as {
  name: string;
};

/** Les arches, LUES dans electron-builder.cjs (règle 9 : cette liste n'a qu'une maison). */
export const macArches = (config?: EbConfigShape): string[] =>
  shippedTriples("mac", config).map((t) => t.split("-").slice(1).join("-"));

/** Les identifiants d'Apple. Absents ⇒ on s'arrête AVANT de signer : découvrir qu'on ne peut
 *  pas notariser après 40 minutes d'empaquetage est le pire moment pour l'apprendre. */
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

/** Exécute une commande, en héritant des flux. Rejette sur un code non nul OU un signal —
 *  un enfant tué n'a pas de code, et le lire comme un succès expédierait du non-notarisé. */
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

/**
 * Le dossier de l'app d'une arche — VÉRIFIÉ, pas supposé. electron-builder nomme
 * `release/mac` et `release/mac-arm64`, mais cette convention est la sienne : on relit donc
 * l'arche réelle du binaire avec `lipo`. Une inversion des deux dossiers livrerait à chaque
 * processeur l'app de l'autre, ce qu'aucune étape ultérieure ne rattraperait.
 */
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

  // ── 1. empaqueter + signer, SANS notariser ────────────────────────────────────────────
  console.log("[mac-release] 1/5 empaquetage + signature (notarisation désactivée)");
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

  // Un .app sans `app-update.yml` ne saura plus JAMAIS se mettre à jour : chaque
  // vérification meurt en ENOENT, et la seule issue pour l'utilisateur est une
  // réinstallation à la main. On refuse donc de continuer — ICI, avant de payer
  // 20 minutes de notarisation pour un artefact qu'il faudra rappeler. Le fichier
  // est écrit par `afterPack.cjs` (l'empaquetage `--dir` seul ne le produit pas).
  for (const arch of arches) {
    const yml = join(apps.get(arch)!, "Contents", "Resources", "app-update.yml");
    if (!DRY && !existsSync(yml)) {
      throw new Error(
        `mac-release: app-update.yml manquant dans l'app ${arch} (${yml}) — ` +
          `un build livré ainsi ne peut plus se mettre à jour. afterPack.cjs doit l'écrire.`,
      );
    }
  }

  // ── 2. notariser LES DEUX en parallèle ────────────────────────────────────────────────
  console.log("[mac-release] 2/5 notarisation des deux arches EN PARALLÈLE (l'attente est d'Apple)");
  const started = Date.now();
  const submissions = arches.map(async (arch) => {
    const app = apps.get(arch)!;
    const zip = join(RELEASE, `notarize-${arch}.zip`);
    // Le même `ditto` qu'electron-builder faisait pour nous — notarytool n'accepte pas un
    // dossier .app nu, il lui faut une archive.
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
    console.log(`[mac-release]   ${arch} : notarisé`);
  });
  // ⚠️ `allSettled`, pas `all` : avec `all`, la première arche en échec ferait sortir le
  // process pendant que l'autre soumission court encore, et on perdrait le diagnostic de
  // celle qui a peut-être échoué aussi. On attend TOUT, puis on décide — et on échoue si
  // l'une quelconque a échoué.
  const results = await Promise.allSettled(submissions);
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${arches[i]} : ${r.reason}`] : []));
  if (failed.length > 0) {
    console.error(`mac-release: notarisation en échec —\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`[mac-release]   les deux notarisations ont pris ${Math.round((Date.now() - started) / 1000)} s AU TOTAL`);

  // ── 3. agrafer AVANT de fabriquer quoi que ce soit ────────────────────────────────────
  console.log("[mac-release] 3/5 agrafage des tickets");
  for (const arch of arches) await run("xcrun", ["stapler", "staple", apps.get(arch)!]);

  // ── 4. dmg + zip depuis les apps agrafées ─────────────────────────────────────────────
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
    // Chaque passe réécrit `latest-mac.yml` avec SES seuls fichiers : on met de côté avant
    // que la suivante ne l'écrase.
    const produced = join(RELEASE, "latest-mac.yml");
    const kept = join(RELEASE, `latest-mac.${arch}.yml`);
    if (!DRY) {
      if (!existsSync(produced)) throw new Error(`mac-release: ${produced} manquant après l'arche ${arch}`);
      renameSync(produced, kept);
    }
    manifests.push(kept);
  }

  // ── 5. un seul manifeste ──────────────────────────────────────────────────────────────
  // La fusion est faite par `apps/updates`, à qui le format appartient et qui la met déjà en
  // œuvre pour SERVIR des legs publiés séparément (`src/lib/desktopArch.ts`). Une seconde
  // implémentation ici serait exactement le doublon que la règle 9 interdit ; on appelle donc
  // la sienne, en CLI — il n'y a pas d'import d'app à app.
  console.log("[mac-release] 5/5 fusion des manifestes");
  await run(
    "pnpm",
    ["exec", "tsx", "apps/updates/scripts/merge-desktop-manifests.ts", "--out", join(RELEASE, "latest-mac.yml"), ...manifests],
    { cwd: ROOT },
  );
  console.log("[mac-release] terminé.");
}

// ⚠️ Rien ne s'exécute à l'IMPORT. Ce module est chargé par son test (qui vérifie la seule
// décision pure : quelles arches), et un script qui empaquette au moment où on l'importe est
// un script qu'on finit par ne pas tester du tout.
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
