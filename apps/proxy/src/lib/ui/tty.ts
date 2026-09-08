// The ANSI layer: 24-bit colour when the terminal takes it, plain text otherwise
// (`NO_COLOR`, a pipe, `TERM=dumb`). Every helper returns a string; nothing here writes.
// Width and truncation go through `string-width`/`cli-truncate`, which count what a terminal
// actually shows — an accent, a CJK glyph and an escape sequence are not one column each.
import cliTruncate from "cli-truncate";
import stringWidth from "string-width";

export interface Tty {
  readonly colors: boolean;
  /** Terminal columns, read live: a window is resized while the proxy runs. */
  readonly columns: number;
  bold(s: string): string;
  dim(s: string): string;
  fg(hex: string, s: string): string;
  /** A pastel pill: `hex` behind, the ink on top — the terminal twin of the app's marks. */
  pill(hex: string, ink: string, s: string): string;
  /** Visible width of `s` once the escapes are gone. */
  width(s: string): number;
  /** `s` cut to `n` columns with an ellipsis, escapes preserved. `where` says which end goes:
   *  "end" for prose, "middle" for a path whose tail carries the meaning. */
  fit(s: string, n?: number, where?: "end" | "middle"): string;
  /** `s` padded with spaces to `n` visible columns. */
  pad(s: string, n: number): string;
  strip(s: string): string;
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

export function createTty(
  colors: boolean,
  columnsOf: () => number = () => process.stderr.columns || 80,
): Tty {
  const wrap = (open: string, s: string) => (colors ? `${ESC}${open}m${s}${ESC}0m` : s);
  return {
    colors,
    get columns() {
      return columnsOf();
    },
    bold: (s) => wrap("1", s),
    dim: (s) => wrap("2", s),
    fg: (hex, s) => wrap(`38;2;${hexToRgb(hex).join(";")}`, s),
    pill: (hex, ink, s) =>
      colors
        ? `${ESC}48;2;${hexToRgb(hex).join(";")}m${ESC}38;2;${hexToRgb(ink).join(";")}m ${s} ${ESC}0m`
        : `[${s}]`,
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
