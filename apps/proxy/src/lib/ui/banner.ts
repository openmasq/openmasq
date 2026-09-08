// The start-up card: a hairline frame, the mark, where to point a tool. Drawn by hand rather
// than by a box library because every row already carries colour escapes — the widths come
// from `tty.width`, which counts columns, not code units.
import type { ProxyConfig } from "../../config/config.js";
import { envLines } from "../baseUrls.js";
import { HUE_HEX, LIME_HEX } from "./palette.js";
import type { Tty } from "./tty.js";

export interface KeyHint {
  key: string;
  label: string;
}

/** `on` = the model is loaded · `rules` = this level does not need it · `off` = wanted, absent. */
export type ModelState = "on" | "rules" | "off";

export interface BannerData {
  model: ModelState;
  version: string;
  keys?: KeyHint[];
  /** A wrapped tool owns the terminal: the frame only, no env block. */
  compact?: boolean;
  /** `--reveal`: say plainly that real data is about to appear on this screen. */
  reveal?: boolean;
}

const MAX_WIDTH = 92;

/** The card and the footer share one width, so their rules line up. */
export function blockWidth(tty: Tty): number {
  return Math.max(40, Math.min(MAX_WIDTH, tty.columns - 4));
}

// The frame is drawn in dimmed slate: the app's border tokens are alpha over a known paper,
// which a terminal of unknown background cannot reproduce. Slate is the palette's neutral.
const stroke = (tty: Tty, s: string) => tty.dim(tty.fg(HUE_HEX.slate, s));

/** A framed block: `title` sits in the top rule, `right` at its end. */
export function frame(tty: Tty, title: string, right: string, rows: string[]): string[] {
  const width = blockWidth(tty);
  const inner = width - 4;
  const line = (s: string) =>
    `  ${stroke(tty, "│")} ${tty.pad(tty.fit(s, inner), inner)} ${stroke(tty, "│")}`;
  const dashes = (n: number) => stroke(tty, "─".repeat(Math.max(0, n)));
  const head = `  ${stroke(tty, "╭─")} ${title} `;
  const tail = right ? ` ${right} ${stroke(tty, "─")}` : stroke(tty, "─");
  const fill = width - tty.width(tty.strip(head).slice(2)) - tty.width(tty.strip(tail)) - 1;
  return [
    `${head}${dashes(fill)}${tail}${stroke(tty, "╮")}`,
    ...rows.map(line),
    `  ${stroke(tty, `╰${"─".repeat(width - 2)}╯`)}`,
  ];
}

export function keyHintLine(tty: Tty, hints: KeyHint[]): string {
  return `  ${hints.map((h) => `${tty.pill(HUE_HEX.slate, "#0f1c06", h.key)} ${tty.dim(h.label)}`).join("  ")}`;
}

const host = (origin: string): string => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

/** How the model's state reads, in the card and in the footer. */
export function modelLabel(tty: Tty, state: ModelState, long: boolean): string {
  if (state === "on") return tty.fg(HUE_HEX.mint, long ? "local model ✓" : "model ✓");
  if (state === "off") return tty.fg(HUE_HEX.red, long ? "model OFF — names in clear" : "no model");
  return tty.dim(long ? "pattern rules only — no model needed" : "rules");
}

export function renderBanner(tty: Tty, config: ProxyConfig, d: BannerData): string[] {
  const url = `http://${config.host}:${config.port}`;
  const label = (s: string) => tty.dim(tty.pad(s, 13));
  const rows = [
    `${label("listening")}${tty.bold(url)}`,
    `${label("upstreams")}${tty.dim("openai")} ${host(config.openai)} ${tty.dim("· anthropic")} ${host(config.anthropic)} ${tty.dim("· gemini")} ${host(config.gemini)}`,
    `${label("masking")}${tty.bold(config.level)} ${tty.dim("· the model sees")} ${tty.bold(config.mode === "token" ? "tokens" : "fakes")}`,
    `${label("detection")}${modelLabel(tty, d.model, true)}`,
  ];
  const dials = [
    config.always.length ? `${config.always.length} always-masked` : "",
    config.keep.length ? `${config.keep.length} kept in clear` : "",
    config.disabledKinds.length ? `${config.disabledKinds.join(", ")} left in clear` : "",
  ].filter(Boolean);
  if (dials.length) rows.push(`${label("")}${tty.dim(dials.join(" · "))}`);
  if (d.reveal)
    rows.push(
      `${label("reveal")}${tty.fg(HUE_HEX.amber, "real values printed below — this screen only, never the log")}`,
    );
  if (!d.compact) {
    rows.push("", `${label("point a tool")}${tty.dim("in its shell — or press c to copy")}`);
    for (const l of envLines(url)) rows.push(`${label("")}${l}`);
  }
  return frame(
    tty,
    `${tty.fg(LIME_HEX, "◍")} ${tty.bold("OpenMasq proxy")}`,
    tty.dim(`v${d.version}`),
    rows,
  );
}
