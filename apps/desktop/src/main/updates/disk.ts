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

/** electron-updater's EXACT arch test (does the name CONTAIN "arm64"). */
const isArm64File = (name: string): boolean => name.includes("arm64");

/**
 * The bytes electron-updater will actually DOWNLOAD: ONE file (the `.zip` for THIS arch),
 * NOT the manifest's sum, or a two-arch manifest overstates the space needed by a factor
 * that refuses an update which fits. Pinned by `disk.test.ts`.
 */
export function totalUpdateSize(info: UpdInfo | undefined, arm64 = process.arch === "arm64"): number {
  const files = info?.files ?? [];
  // The `.zip` is the only artifact the updater looks for (`findFile(files, "zip", …)`).
  const zips = files.filter((f) => (f.url ?? "").toLowerCase().endsWith(".zip"));
  const forArch = arm64
    ? // arm64 preferred WHEN it exists, else the Intel entries, exactly like the client.
      (zips.some((f) => isArm64File(f.url ?? "")) ? zips.filter((f) => isArm64File(f.url ?? "")) : zips)
    : zips.filter((f) => !isArm64File(f.url ?? ""));
  // A manifest with no usable `url` must not drop the requirement to zero: the largest
  // announced file overestimates instead.
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

// The installer unzips a full second copy of the app before swapping: installing needs the
// download PLUS the uncompressed app free. ~2.2× the .zip is a safe estimate.
export const APPLY_SPACE_FACTOR = 2.2;

/** Map a raw updater / ShipIt error to a user-safe FR message (+ a stable code) so the
 *  UI never shows a `ditto`/`pkzip` technical dump. */
export function humanizeUpdateError(err: unknown): { code: string; message: string } {
  const e = err as { message?: string; code?: string; errno?: number } | undefined;
  // The CODE matters as much as the text: macOS localizes its network errors, so
  // `code`/`errno` are read too, and the localized phrasings are matched.
  const raw = [e?.message ?? err ?? "", e?.code ?? ""].filter(Boolean).join(" ");
  if (/no space left|enospc|pkzip signature|not enough space|disk.*full|espace disque/i.test(raw))
    return {
      code: "no_space",
      message:
        "Espace disque insuffisant pour installer la mise à jour. Libérez de l'espace disque, puis réessayez.",
    };
  // READ-ONLY volume (the mounted `.dmg`, or Downloads under translocation): NOT a bug,
  // the remedy is moving the app. An ENVIRONMENT fact, not an update failure (index.ts).
  if (/read-only volume|move the application|read only volume|volume en lecture seule/i.test(raw))
    return {
      code: "read_only_volume",
      message:
        `Pour se mettre à jour, ${BRAND.name} doit être dans le dossier Applications. Déplacez l'app depuis le disque d'installation (ou Téléchargements) vers Applications, puis relancez-la.`,
    };
  // "App Still Running": the installer saw >1 instance of the bundle. The self-spawned
  // children are killed before quitAndInstall, so this is a fallback message.
  if (/app still running|running instances|sqrlinstaller/i.test(raw))
    return {
      code: "app_running",
      message:
        `Une partie de l'app tournait encore. Quittez complètement ${BRAND.name}, puis relancez la mise à jour.`,
    };
  // Integrity: the download didn't match the manifest. The most important failure to see.
  if (/sha512|checksum|signature|not signed|integrity|corrupt/i.test(raw))
    return {
      code: "signature",
      message: "La mise à jour téléchargée n'a pas pu être vérifiée (intégrité). Réessayez.",
    };
  // A 4xx/5xx from the feed; the STATUS rides in the code (`download-404`).
  const httpStatus = /(?:status(?: code)?|httperror|response code)\D*(\d{3})/i.exec(raw)?.[1];
  if (httpStatus || /cannot download|download failed|unable to download/i.test(raw))
    return {
      code: httpStatus ? `download-${httpStatus}` : "download",
      message: "Téléchargement de la mise à jour impossible. Vérifiez votre connexion, puis réessayez.",
    };
  // Transport: DNS / refused / reset / timeout before any HTTP status.
  if (
    /enotfound|econnrefused|econnreset|etimedout|epipe|socket hang|network|timed?\s?out/i.test(raw) ||
    // The same causes, stated by the OS in the user's language.
    /requête a expiré|délai d'attente|connexion.*(perdue|interrompue)|hors ligne|impossible de se connecter/i.test(raw)
  )
    return {
      code: "network",
      message: "Connexion au serveur de mise à jour impossible. Vérifiez votre réseau, puis réessayez.",
    };
  return { code: "generic", message: "La mise à jour a échoué. Réessayez plus tard." };
}
