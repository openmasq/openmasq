import type { Messages } from "@openmasq/i18n";
/**
 * Library file classification + display helpers (pure). Buckets a stored file into
 * one of the design's category tabs (Images / Documents / Tableurs / Audio) from its
 * mime + name, and derives the extension chip / tint / date shown on a card.
 */

/** A library category — the tabs the grid filters by. */
export type LibKind = "image" | "document" | "sheet" | "audio";

const IMG = /^image\/|\.(png|jpe?g|webp|bmp|tiff?|gif|svg)$/i;
const SHEET = /spreadsheetml|ms-excel|opendocument\.spreadsheet|^text\/csv|\.(xlsx|xlsm|xls|ods|csv|tsv)$/i;
const AUDIO = /^audio\/|\.(m4a|mp3|wav|ogg|oga|aac|flac|opus|webm)$/i;

/** Classify a stored file into a library category (everything non-image/sheet/audio
 *  — pdf/docx/pptx/text/markdown/… — is a "document"). */
export function libKindOf(mime: string, name: string): LibKind {
  const m = mime || "";
  if (IMG.test(m) || IMG.test(name)) return "image";
  if (SHEET.test(m) || SHEET.test(name)) return "sheet";
  if (AUDIO.test(m) || AUDIO.test(name)) return "audio";
  return "document";
}

/** What the library's tab bar can be showing. Only stored files: the granted local
 *  folders are browsed from the right rail, never copied here. */
export type LibTab = "all" | LibKind;

/** The category tabs, in the design's order — the WORDS come from the catalogue. */
export const LIB_TAB_IDS: readonly ("all" | LibKind)[] = ["all", "image", "document", "sheet", "audio"];

export function libTabs(t: Messages): { id: "all" | LibKind; label: string }[] {
  return LIB_TAB_IDS.map((id) => ({ id, label: t.lists.libraryTabs[id] }));
}

/** Uppercase extension chip (PDF / XLS / DOC…), capped to 4 chars. Implemented one tier
 *  down (`state/localFsPaths.ts`) since the right rail's folder tree labels files the same
 *  way and a container may not read this module; re-exported so the cards keep their name. */
export { extLabel as extOf } from "../../state/files/localFsPaths";

/* ⚠️ NO tint by extension — and above all not the one that used to live here.
 *
 * `toneFor` hashed the extension to one of the SIX highlight colors, written as a FROZEN
 * hex then applied as inline style. Three things at once:
 *   · those six tints are the LANGUAGE OF REDACTION (`SECTION_HUE`) — a pink PDF next to
 *     a pink brand asserts a kinship that doesn't exist;
 *   · a frozen hex inverts with no theme (rule 12): the tint stayed light on
 *     both dark backgrounds;
 *   · and the color said NOTHING — a hash is not a category, two spreadsheets
 *     came out in two colors and a PDF could share its own with an MP3.
 * The thumbnail is therefore neutral chrome (`--surface-sunken` + its type's glyph), and
 * color stays reserved for what actually carries one: the redaction mark, the "protégé"
 * shield, the selection.
 */

/** Always-visible file date: relative for the last 2 days, else "13 janv. 2026"
 *  (with year). Guards a missing/invalid timestamp → empty (not "Invalid Date"). */
export function fmtDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = (Date.now() - ts) / 86400000;
  if (d < 1) return "Aujourd'hui";
  if (d < 2) return "Hier";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
