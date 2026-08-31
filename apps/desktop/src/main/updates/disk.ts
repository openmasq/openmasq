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

/** An artifact's arch, with electron-updater's EXACT test
 *  (`MacUpdater.filterFilesForArch`: does the name CONTAIN "arm64"). A different definition
 *  here and we'd weigh a file the client won't download. */
const isArm64File = (name: string): boolean => name.includes("arm64");

/**
 * The bytes electron-updater will actually DOWNLOAD for this update.
 *
 * ⚠️ ONE SINGLE FILE, NOT THE MANIFEST. On macOS, Squirrel.Mac applies the `.zip` — the
 * manifest's `.dmg` is there only for manual download from the site, and
 * `MacUpdater` keeps only the entries for ITS OWN processor. Summing `files` therefore amounted
 * to counting, since mac ships two arches, TWO zips plus TWO dmg: 2.9 GB
 * announced where the machine downloads 0.72 — and, multiplied by `APPLY_SPACE_FACTOR`,
 * 6.4 GB of space required instead of ~2.4. The pre-flight then REFUSED an update that
 * fit comfortably (reported on 0.5.0-staging.149, 3.9 GB free).
 *
 * A guard that fails closed should err on the right side, but not by two arches and a
 * factor of three: at that rate it no longer prevents a failure, it prevents the update.
 * Pinned by `disk.test.ts` ("weighs the one file this machine will download").
 */
export function totalUpdateSize(info: UpdInfo | undefined, arm64 = process.arch === "arm64"): number {
  const files = info?.files ?? [];
  // The `.zip` is the only artifact the updater looks for (`findFile(files, "zip", …)`).
  const zips = files.filter((f) => (f.url ?? "").toLowerCase().endsWith(".zip"));
  const forArch = arm64
    ? // On Apple Silicon (Rosetta included) arm64 is preferred WHEN it exists; otherwise we
      // fall back to the Intel entries, exactly like the client.
      (zips.some((f) => isArm64File(f.url ?? "")) ? zips.filter((f) => isArm64File(f.url ?? "")) : zips)
    : zips.filter((f) => !isArm64File(f.url ?? ""));
  // A manifest with no usable `url` (old format, malformed entry) must not
  // drop the requirement to zero — the guard would be mute. So the largest
  // announced file is used instead, which overestimates what will be downloaded.
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
  // The CODE matters as much as the text: macOS localizes its network errors, so a
  // French device's message reads « La requête a expiré. » and no English pattern
  // recognizes it. Measured: these failures surfaced as `updater-generic`, and the user
  // read « La mise à jour a échoué » instead of « vérifiez votre réseau » — the one
  // piece of advice that would have helped. So `code`/`errno` are read in addition to the text, and
  // the localized phrasings telemetry has actually shown are added.
  const raw = [e?.message ?? err ?? "", e?.code ?? ""].filter(Boolean).join(" ");
  if (/no space left|enospc|pkzip signature|not enough space|disk.*full|espace disque/i.test(raw))
    return {
      code: "no_space",
      message:
        "Espace disque insuffisant pour installer la mise à jour. Libérez de l'espace disque, puis réessayez.",
    };
  // READ-ONLY volume: the app is running from the mounted `.dmg`, or from Downloads
  // under Gatekeeper translocation — Squirrel.Mac can't overwrite itself. This
  // is NOT a bug: the only remedy is moving the app into /Applications, and
  // "try again" (the `generic` message) is bad advice. Classified separately to give
  // the RIGHT action AND to stop surfacing it as an exception (index.ts) — it's an
  // ENVIRONMENT fact, not an update failure. Measured: 5 users, 27 times.
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
    // The same causes, stated by the OS in the user's language.
    /requête a expiré|délai d'attente|connexion.*(perdue|interrompue)|hors ligne|impossible de se connecter/i.test(raw)
  )
    return {
      code: "network",
      message: "Connexion au serveur de mise à jour impossible. Vérifiez votre réseau, puis réessayez.",
    };
  return { code: "generic", message: "La mise à jour a échoué. Réessayez plus tard." };
}
