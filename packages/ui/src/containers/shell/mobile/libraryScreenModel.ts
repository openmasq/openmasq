import { extOf, fmtDate } from "../../../pages/Library/libraryKinds";
import type { LibFile } from "../../../pages/Library";

/**
 * The mobile Bibliothèque's two segments (kit `chat-app-mobile` Library: Fichiers ⇄
 * Images). A phone gets TWO buckets, not the desktop's five tabs — tableurs and audio
 * are files you read in a list, images are things you scan in a grid, and that is the
 * only distinction a thumb-sized target can carry. Same `LibFile.kind` underneath, so
 * a file lands in exactly one place on both platforms.
 */
export type MobileLibSegment = "files" | "images";

export function segmentOf(f: LibFile): MobileLibSegment {
  return f.kind === "image" ? "images" : "files";
}

/** Split ONE listing into the two segments, preserving order (newest first). */
export function splitBySegment(files: LibFile[]): Record<MobileLibSegment, LibFile[]> {
  const out: Record<MobileLibSegment, LibFile[]> = { files: [], images: [] };
  for (const f of files) out[segmentOf(f)].push(f);
  return out;
}

/**
 * The row's second line. Only facts we actually hold: the extension and the date.
 * `FileMeta` carries no byte size, so the kit's "2,4 Mo · PDF" becomes "PDF · 13 janv.
 * 2026" — a fabricated size on a privacy tool is worse than a missing one. A file with
 * no extension and no usable date yields "", and the row simply shows one line.
 */
export function fileMetaLine(f: LibFile): string {
  const ext = /\.[a-z0-9]{1,5}$/i.test(f.name) ? extOf(f.name) : "";
  const date = fmtDate(f.createdAt);
  return [ext, date].filter(Boolean).join(" · ");
}
