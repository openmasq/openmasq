/**
 * PURE descriptor of the DOCUMENT font (Inter, SIL OFL 1.1), importable by the main bundle
 * AND `scripts/bake-document-fonts.ts`: one pin, read by the bake that fetches the file and
 * by main that re-verifies it before a byte reaches a font parser (rule 7).
 *
 * Origin: the OFFICIAL google/fonts repository at a pinned COMMIT (never a branch, never a
 * CDN). The bake fails closed on a digest mismatch; main refuses an unverified file and the
 * document falls back to a system sans.
 */
import { createHash } from "node:crypto";

/** google/fonts commit the bytes are taken from (github.com/google/fonts). */
export const GOOGLE_FONTS_COMMIT = "0b58fb370093f9a9f4ff785d94405710b79de67c";
const BASE = `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/inter`;

/** The resources folder the bake writes and electron-builder ships (`extraResources`). */
export const DOCUMENT_FONTS_DIRNAME = "document-fonts";

/** The variable font (opsz + wght axes): ONE file gives every weight. */
export const DOCUMENT_FONT = {
  family: "Inter",
  file: "Inter.ttf",
  url: `${BASE}/Inter%5Bopsz%2Cwght%5D.ttf`,
  sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
} as const;

/** The OFL travels next to the font it licenses. */
export const DOCUMENT_FONT_LICENSE = {
  file: "OFL.txt",
  url: `${BASE}/OFL.txt`,
  sha256: "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57",
} as const;

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** True only for the exact pinned bytes. */
export const isPinnedDocumentFont = (bytes: Uint8Array): boolean => sha256Hex(bytes) === DOCUMENT_FONT.sha256;
