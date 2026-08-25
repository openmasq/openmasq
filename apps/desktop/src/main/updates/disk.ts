import { statfs } from "node:fs/promises";
import { BRAND } from "@openmasq/branding";

// ── Download size + free-disk + friendly errors ─────────────────────────────
export interface UpdFile {
  url?: string;
  size?: number;
}
export interface UpdInfo {
  version?: string;
  files?: UpdFile[];
}

/** L'arche d'un artefact, avec le test EXACT d'electron-updater
 *  (`MacUpdater.filterFilesForArch` : le nom CONTIENT-il « arm64 »). Une autre définition
 *  ici et on pèserait un fichier que le client ne téléchargera pas. */
const isArm64File = (name: string): boolean => name.includes("arm64");

/**
 * Les octets qu'electron-updater va réellement TÉLÉCHARGER pour cette mise à jour.
 *
 * ⚠️ UN SEUL FICHIER, PAS LE MANIFESTE. Sur macOS, Squirrel.Mac applique le `.zip` — le
 * `.dmg` du manifeste n'est là que pour le téléchargement manuel depuis le site, et
 * `MacUpdater` ne retient que les entrées de SON processeur. Additionner `files` revenait
 * donc à compter, depuis que mac livre deux arches, DEUX zips plus DEUX dmg : 2,9 Go
 * annoncés là où la machine en télécharge 0,72 — et, multiplié par `APPLY_SPACE_FACTOR`,
 * 6,4 Go d'espace exigés au lieu de ~2,4. Le pré-vol REFUSAIT alors une mise à jour qui
 * tenait largement (signalé sur 0.5.0-staging.149, 3,9 Go libres).
 *
 * Un garde qui échoue fermé doit se tromper du bon côté, mais pas de deux arches et d'un
 * facteur trois : à ce compte-là il n'empêche plus un échec, il empêche la mise à jour.
 * Épinglé par `disk.test.ts` (« pèse le seul fichier que cette machine téléchargera »).
 */
export function totalUpdateSize(info: UpdInfo | undefined, arm64 = process.arch === "arm64"): number {
  const files = info?.files ?? [];
  // Le `.zip` est le seul artefact que l'updater cherche (`findFile(files, "zip", …)`).
  const zips = files.filter((f) => (f.url ?? "").toLowerCase().endsWith(".zip"));
  const forArch = arm64
    ? // Sur Apple Silicon (Rosetta compris) l'arm64 est préféré QUAND il existe ; sinon on
      // retombe sur les entrées Intel, exactement comme le client.
      (zips.some((f) => isArm64File(f.url ?? "")) ? zips.filter((f) => isArm64File(f.url ?? "")) : zips)
    : zips.filter((f) => !isArm64File(f.url ?? ""));
  // Un manifeste sans `url` exploitable (ancien format, entrée mal formée) ne doit pas
  // faire retomber le besoin à zéro — le garde serait muet. On reprend alors le plus gros
  // fichier annoncé, qui majore ce qui sera téléchargé.
  const chosen = forArch.length > 0 ? forArch : files;
  return chosen.reduce((n, f) => Math.max(n, f.size ?? 0), 0);
}

/** Free bytes on the volume holding `path` (null if it can't be read). */
export async function freeBytes(path: string): Promise<number | null> {
  try {
    const s = await statfs(path);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Human GB, 1 decimal (e.g. "1.4 Go"). */
export const fmtGB = (b: number): string => `${(b / 1e9).toFixed(1)} Go`;

// ShipIt (Squirrel.Mac) applies the update by `ditto`-UNZIPPING the downloaded .zip
// into a full second copy of the app before swapping — so installing needs roughly the
// download PLUS the uncompressed app free. ~2.2× the .zip is a safe estimate; below it,
// the apply fails mid-way with a raw `ditto: No space left on device` (the reported bug).
export const APPLY_SPACE_FACTOR = 2.2;

/** Map a raw updater / ShipIt error to a user-safe FR message (+ a stable code) so the
 *  UI never shows a `ditto`/`pkzip` technical dump. */
export function humanizeUpdateError(err: unknown): { code: string; message: string } {
  const e = err as { message?: string; code?: string; errno?: number } | undefined;
  // Le CODE compte autant que le texte : macOS localise ses erreurs réseau, donc le
  // message d'un appareil français dit « La requête a expiré. » et aucun motif anglais ne
  // le reconnaît. Mesuré : ces échecs remontaient en `updater-generic`, et l'utilisateur
  // lisait « La mise à jour a échoué » au lieu de « vérifiez votre réseau » — le seul
  // conseil qui l'aurait aidé. On lit donc `code`/`errno` en plus du texte, et on ajoute
  // les formulations localisées que la télémétrie a réellement montrées.
  const raw = [e?.message ?? err ?? "", e?.code ?? ""].filter(Boolean).join(" ");
  if (/no space left|enospc|pkzip signature|not enough space|disk.*full|espace disque/i.test(raw))
    return {
      code: "no_space",
      message:
        "Espace disque insuffisant pour installer la mise à jour. Libérez de l'espace disque, puis réessayez.",
    };
  // Volume EN LECTURE SEULE : l'app tourne depuis le `.dmg` monté, ou depuis Downloads
  // sous la translocation Gatekeeper — Squirrel.Mac ne peut pas s'écraser lui-même. Ce
  // n'est PAS un bug : le seul remède est de déplacer l'app dans /Applications, et
  // « réessayer » (le message `generic`) est un faux conseil. Classé à part pour donner
  // la BONNE action ET pour cesser de le remonter en exception (index.ts) — c'est un fait
  // d'ENVIRONNEMENT, pas une panne de mise à jour. Mesuré : 5 utilisateurs, 27 fois.
  if (/read-only volume|move the application|read only volume|volume en lecture seule/i.test(raw))
    return {
      code: "read_only_volume",
      message:
        `Pour se mettre à jour, ${BRAND.name} doit être dans le dossier Applications. Déplacez l'app depuis le disque d'installation (ou Téléchargements) vers Applications, puis relancez-la.`,
    };
  // "App Still Running Error" (SQRLInstaller Code=-9): ShipIt aborts the swap because it
  // still sees >1 running instance of the bundle (a self-spawned agent-browser / playwright-
  // mcp child that outlived the main process). We kill those before quitAndInstall, so this
  // is now a fallback message only.
  if (/app still running|running instances|sqrlinstaller/i.test(raw))
    return {
      code: "app_running",
      message:
        `Une partie de l'app tournait encore. Quittez complètement ${BRAND.name}, puis relancez la mise à jour.`,
    };
  // Integrity: the downloaded file didn't match the signed manifest — the most important
  // failure to see in telemetry (a bad/corrupted release), so classify it FIRST.
  if (/sha512|checksum|signature|not signed|integrity|corrupt/i.test(raw))
    return {
      code: "signature",
      message: "La mise à jour téléchargée n'a pas pu être vérifiée (intégrité). Réessayez.",
    };
  // Download never arrived: a 4xx/5xx from the feed/CDN. Keep the STATUS in the code
  // (`download-404`) so PostHog groups by exactly what the server returned.
  const httpStatus = /(?:status(?: code)?|httperror|response code)\D*(\d{3})/i.exec(raw)?.[1];
  if (httpStatus || /cannot download|download failed|unable to download/i.test(raw))
    return {
      code: httpStatus ? `download-${httpStatus}` : "download",
      message: "Téléchargement de la mise à jour impossible. Vérifiez votre connexion, puis réessayez.",
    };
  // Transport: DNS / refused / reset / timeout before any HTTP status.
  if (
    /enotfound|econnrefused|econnreset|etimedout|epipe|socket hang|network|timed?\s?out/i.test(raw) ||
    // Les mêmes causes, dites par l'OS dans la langue de l'utilisateur.
    /requête a expiré|délai d'attente|connexion.*(perdue|interrompue)|hors ligne|impossible de se connecter/i.test(raw)
  )
    return {
      code: "network",
      message: "Connexion au serveur de mise à jour impossible. Vérifiez votre réseau, puis réessayez.",
    };
  return { code: "generic", message: "La mise à jour a échoué. Réessayez plus tard." };
}
