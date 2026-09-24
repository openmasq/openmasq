// The lockup that opens the screen: the brand mark, then the name, the endpoint and what the
// proxy promises. Three rows, drawn ONCE at start-up.
//
// ⚠️ The mark is painted as a BLOCK — the brand fill with the ink made for it — never as
// brand-coloured glyphs. `--brand` is a deep indigo: a glyph in it vanishes on a dark
// terminal and reads thin on a light one, and the ink that goes with it changes per theme
// (`palette.ts` carries the pair, rule 12). Filling is also the only way a terminal of
// unknown background gets a KNOWN ground under the ink.
//
// The shape is the app's own motif: a marker swipe across a tile, the same gesture that
// covers a redacted span in the chat. Solid blocks only — a box-drawing flourish or a Nerd
// Font glyph is a bet on a font the reader may not have.
import type { Tty } from "./tty.js";

/** Columns of the mark, gutter excluded. */
const MARK_W = 9;
const GUTTER = "  ";

export interface Lockup {
  version: string;
  /** Where a tool points. The one string a reader copies. */
  url: string;
}

/** The three rows of the mark, each filled edge to edge in the brand pair. */
export function markRows(tty: Tty): string[] {
  const { brand, inkOnBrand } = tty.theme;
  const row = (glyphs: string) => tty.fill(brand, inkOnBrand, MARK_W, () => glyphs);
  return [row(""), row(" ███████ "), row("")];
}

/**
 * The mark on the left, three lines of identity on the right. Without colours the mark is
 * dropped rather than approximated: a block of `#` is noise, and the name below carries the
 * same information.
 */
export function renderLockup(tty: Tty, d: Lockup): string[] {
  const name = `${tty.bold("OpenMasq")} ${tty.dim("proxy")}`;
  const withVersion = `${name}  ${tty.dim(`v${d.version}`)}`;
  const text = [
    tty.width(tty.strip(withVersion)) <= textWidth(tty) ? withVersion : name,
    tty.bold(d.url),
    tty.dim(promise(tty)),
  ];
  if (!tty.colors) return text.map((l) => `  ${tty.fit(l, textWidth(tty))}`);
  return markRows(tty).map((m, i) => `  ${m}${GUTTER}${tty.fit(text[i] ?? "", textWidth(tty))}`);
}

function textWidth(tty: Tty): number {
  return Math.max(20, tty.columns - MARK_W - GUTTER.length - 4);
}

// The promise is the one line that must not be cut: "before it leaves t…" says something
// weaker about where the data goes than saying nothing at all. So the widest version that
// FITS is the one printed, and a narrow terminal gets none — the card below carries the
// whole statement anyway.
const PROMISES = [
  "personal data is masked here, before it leaves this machine",
  "masked before it leaves this machine",
  "masked before it leaves",
];

function promise(tty: Tty): string {
  const room = textWidth(tty);
  return PROMISES.find((p) => tty.width(p) <= room) ?? "";
}
