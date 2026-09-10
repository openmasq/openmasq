// The ANSI layer: colour when the terminal takes it, plain text otherwise (`NO_COLOR`, a
// pipe, `TERM=dumb`). Every helper returns a string; nothing here writes. Width and
// truncation go through `string-width`/`cli-truncate`, which count what a terminal actually
// shows — an accent, a CJK glyph and an escape sequence are not one column each.
import cliTruncate from "cli-truncate";
import stringWidth from "string-width";
import type { ThemeHex } from "./palette.js";
import { colorDepth, type Depth, resolveTheme, themeHex, type ThemeName } from "./theme.js";

/** The pens available INSIDE a filled row: none of them may reset, or the fill stops. */
export interface FillPen {
  /** Re-colour the foreground, then restore the row's base ink. */
  ink(hex: string, s: string): string;
  strong(s: string): string;
  faint(s: string): string;
}

export interface Tty {
  readonly colors: boolean;
  /** Terminal columns, read live: a window is resized while the proxy runs. */
  readonly columns: number;
  /** The ground this terminal paints on, and the pair that inverts with it. */
  readonly theme: ThemeHex & { name: ThemeName };
  bold(s: string): string;
  dim(s: string): string;
  fg(hex: string, s: string): string;
  /** A pastel pill: `hex` behind, the ink on top — the terminal twin of the app's marks. */
  pill(hex: string, ink: string, s: string): string;
  /** A row filled edge to edge: `bg` behind `width` columns, `ink` as the base foreground.
   *  The builder gets pens that never reset — a `bold()` inside a fill would clear it. */
  fill(bg: string, ink: string, width: number, build: (pen: FillPen) => string): string;
  /** Visible width of `s` once the escapes are gone. */
  width(s: string): number;
  /** `s` cut to `n` columns with an ellipsis, escapes preserved. `where` says which end goes:
   *  "end" for prose, "middle" for a path whose tail carries the meaning. */
  fit(s: string, n?: number, where?: "end" | "middle"): string;
  /** `s` padded with spaces to `n` visible columns. */
  pad(s: string, n: number): string;
  strip(s: string): string;
}

export interface TtyOptions {
  /** Defaults to what the environment says (`theme.ts`). */
  depth?: Depth;
  theme?: ThemeName | "auto";
}

const ESC = "[";
const ANSI = /\[[0-9;]*m/g;

export function colorsWanted(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean | undefined = process.stderr.isTTY,
): boolean {
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
  if (env.NO_COLOR !== undefined) return false;
  if (env.TERM === "dumb") return false;
  return !!isTTY;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** The xterm cube: 6x6x6 colours from 16, then a 24-step grey ramp. A near-grey lands on the
 *  ramp rather than in the cube — the cube's greys are coarse enough to tint a hairline. */
export function hexToAnsi256(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  if (Math.max(r, g, b) - Math.min(r, g, b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export function createTty(
  colors: boolean,
  columnsOf: () => number = () => process.stderr.columns || 80,
  opts: TtyOptions = {},
): Tty {
  const depth = opts.depth ?? colorDepth();
  const name = resolveTheme(opts.theme ?? "auto");
  // A layer, not a colour: 38 is the foreground, 48 the background, and the rest of the
  // sequence is the only thing the depth changes.
  const sgr = (hex: string, layer: 38 | 48) =>
    depth === 24 ? `${layer};2;${hexToRgb(hex).join(";")}` : `${layer};5;${hexToAnsi256(hex)}`;
  const wrap = (open: string, s: string) => (colors ? `${ESC}${open}m${s}${ESC}0m` : s);
  return {
    colors,
    theme: { name, ...themeHex(name) },
    get columns() {
      return columnsOf();
    },
    bold: (s) => wrap("1", s),
    dim: (s) => wrap("2", s),
    fg: (hex, s) => wrap(sgr(hex, 38), s),
    pill: (hex, ink, s) =>
      colors ? `${ESC}${sgr(hex, 48)}m${ESC}${sgr(ink, 38)}m ${s} ${ESC}0m` : `[${s}]`,
    fill(bg, ink, width, build) {
      const plain: FillPen = { ink: (_h, s) => s, strong: (s) => s, faint: (s) => s };
      if (!colors) return this.fit(this.pad(build(plain), width), width);
      const base = `${ESC}${sgr(bg, 48)}m${ESC}${sgr(ink, 38)}m`;
      const pen: FillPen = {
        // Restoring the base re-states the fill too: a reset here would punch a hole in it.
        ink: (hex, s) => `${ESC}${sgr(hex, 38)}m${s}${base}`,
        strong: (s) => `${ESC}1m${s}${ESC}22m`,
        faint: (s) => `${ESC}2m${s}${ESC}22m`,
      };
      const body = this.fit(this.pad(build(pen), width), width);
      return `${base}${body}${ESC}0m`;
    },
    width: (s) => stringWidth(s),
    fit(s, n, where = "end") {
      const max = n ?? this.columns;
      return stringWidth(s) <= max ? s : cliTruncate(s, Math.max(1, max), { position: where });
    },
    pad(s, n) {
      const w = stringWidth(s);
      return w >= n ? s : s + " ".repeat(n - w);
    },
    strip: (s) => s.replace(ANSI, ""),
  };
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
