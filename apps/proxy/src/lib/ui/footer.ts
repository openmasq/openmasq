// The sticky footer: a FILLED bar, then the keys. Filled on purpose — a rule of dashes with
// dim text on it reads as one more log line, and this block is the only thing on screen that
// is not history. Its ground is the brand tint, which is the one surface token that inverts
// with the theme (`palette.ts`).
//
// ⚠️ Everything drawn inside the bar goes through the fill's own pens: an ANSI reset — which
// is what `tty.bold`/`tty.fg` end with — would clear the background for the rest of the row.
import { blockWidth, type KeyHint, keyHintLine, type ModelState } from "./banner.js";
import { HUE_HEX } from "./palette.js";
import { activity, histogram } from "./spark.js";
import { formatDuration, type Tty } from "./tty.js";

export interface Stats {
  requests: number;
  totals: Record<string, number>;
  startedAt: number;
}

/** What the footer shows of a config that the keys can change while it runs. */
export interface Dials {
  level: string;
  mode: "fake" | "token";
  model: ModelState;
}

/** How many recent requests the strip shows: it is a shape, not a history. */
export const ACTIVITY_MAX = 24;

export interface Live {
  /** One outcome hue per recent request, oldest first (`rows.ts`, `outcomeHex`). */
  recent: readonly string[];
  /** The masked total just moved: the number is accented for one repaint, then settles.
   *  Gentle and finite — the brand keeps looping motion out of the product. */
  flash: boolean;
}

export function footerLines(
  tty: Tty,
  s: Stats,
  dials: Dials | undefined,
  hints: KeyHint[],
  uptime: number,
  live: Live,
): string[] {
  // The bar starts where the card's frame does: the two blocks share one left edge.
  const width = blockWidth(tty);
  const { barBg, barInk, brand } = tty.theme;
  const masked = Object.values(s.totals).reduce((a, b) => a + b, 0);
  const bar = tty.fill(barBg, barInk, width, (pen) => {
    const sep = pen.faint(" │ ");
    const left = [
      dials
        ? `${pen.strong(dials.level)} ${pen.faint("·")} ${dials.mode === "token" ? "tokens" : "fakes"} ${pen.faint("·")} ${modelInk(pen, dials.model)}`
        : "",
      s.requests
        ? `${pen.strong(String(s.requests))} req ${pen.faint("·")} ${live.flash ? pen.ink(brand, pen.strong(String(masked))) : pen.strong(String(masked))} masked${bars(tty, s, pen)}`
        : pen.faint("waiting for the first request"),
    ]
      .filter(Boolean)
      .join(sep);
    const strip = activity(tty, live.recent, ACTIVITY_MAX, pen.ink);
    const right = `${strip}${strip ? "  " : ""}${pen.faint(formatDuration(uptime))} `;
    const gap = Math.max(1, width - tty.width(left) - tty.width(right) - 1);
    return ` ${left}${" ".repeat(gap)}${right}`;
  });
  return [`  ${bar}`, tty.fit(keyHintLine(tty, hints))];
}

const bars = (tty: Tty, s: Stats, pen: { ink: (h: string, x: string) => string }): string => {
  const h = histogram(tty, s.totals, 6, pen.ink);
  return h ? `  ${h}` : "";
};

function modelInk(
  pen: { ink: (h: string, s: string) => string; faint: (s: string) => string },
  state: ModelState,
): string {
  if (state === "on") return pen.ink(HUE_HEX.mint, "model ✓");
  if (state === "off") return pen.ink(HUE_HEX.red, "no model");
  return pen.faint("rules");
}
