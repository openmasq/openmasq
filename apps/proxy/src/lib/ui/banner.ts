// The start-up card: the lockup, then a hairline frame carrying the dials and where to point
// a tool. Drawn by hand rather than by a box library because every row already carries colour
// escapes — the widths come from `tty.width`, which counts columns, not code units.
import { DEFAULTS, type ProxyConfig } from "../../config/config.js";
import { envLines } from "../baseUrls.js";
import { renderLockup } from "./mark.js";
import { inClearPhrase } from "./kinds.js";
import { HUE_HEX, INK_HEX } from "./palette.js";
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
  /** `--mcp`: which integrations answered, and what happens to a write. Absent ⇒ no row. */
  mcp?: { servers: string[]; writes: string; url: string; client?: string };
  /** `--console`: the live view's URL, token included. It belongs IN the card — printed as a
   *  note underneath, the one address the operator has to open read as an aside. */
  console?: { url: string; reveal: boolean };
  /** What this level leaves in clear (`disabledKindsFor`) — the card says it in words, the
   *  same way the opening sequence does (`kinds.ts`). */
  inClear?: readonly string[];
}

const MAX_WIDTH = 92;

/** The card and the footer share one width, so their rules line up. */
export function blockWidth(tty: Tty): number {
  return Math.max(40, Math.min(MAX_WIDTH, tty.columns - 4));
}

// The frame is drawn in dimmed slate: the app's border tokens are alpha over a known paper,
// which a terminal of unknown background cannot reproduce. Slate is the palette's neutral,
// and it is one of the nine hues that do NOT flip with the theme.
const stroke = (tty: Tty, s: string) => tty.dim(tty.fg(HUE_HEX.slate, s));

/** A framed block: `title` sits in the top rule, `right` at its end. */
export function frame(tty: Tty, title: string, right: string, rows: string[]): string[] {
  const width = blockWidth(tty);
  const inner = width - 4;
  const line = (s: string) =>
    `  ${stroke(tty, "│")} ${tty.pad(tty.fit(s, inner), inner)} ${stroke(tty, "│")}`;
  const dashes = (n: number) => stroke(tty, "─".repeat(Math.max(0, n)));
  const head = title ? `  ${stroke(tty, "╭─")} ${title} ` : `  ${stroke(tty, "╭─")}`;
  const tail = right ? ` ${right} ${stroke(tty, "─")}` : stroke(tty, "─");
  const fill = width - tty.width(tty.strip(head).slice(2)) - tty.width(tty.strip(tail)) - 1;
  return [
    `${head}${dashes(fill)}${tail}${stroke(tty, "╮")}`,
    ...rows.map(line),
    `  ${stroke(tty, `╰${"─".repeat(width - 2)}╯`)}`,
  ];
}

/** A key, in the brand pair — the same chip the app puts a shortcut in. Eight of them must
 *  fit an 80-column terminal, so the labels are one word and the gap one space. */
export function keyHintLine(tty: Tty, hints: KeyHint[]): string {
  const { brand, inkOnBrand } = tty.theme;
  return `  ${hints.map((h) => `${tty.pill(brand, inkOnBrand, h.key)} ${tty.dim(h.label)}`).join(" ")}`;
}

/** The round trip, in one line: what leaves is masked, what comes back is restored. The two
 *  chips are the app's own marks — a redaction hue on the way out, mint on the way in. */
function flow(tty: Tty, long: boolean): string {
  const out = tty.pill(HUE_HEX.violet, INK_HEX, "masked");
  const back = tty.pill(HUE_HEX.mint, INK_HEX, "restored");
  const arrow = tty.dim(" ▸ ");
  const middle = tty.bold(long ? "the model" : "model");
  return `${tty.bold("you")}${arrow}${out}${arrow}${middle}${arrow}${back}${arrow}${tty.bold("you")}`;
}

/** The three upstreams. A DEFAULT origin is noise — its host says nothing the family does not
 *  — so the compact form names it only when it was pointed somewhere else. */
function upstreams(tty: Tty, config: ProxyConfig, room: number): string {
  const full = `${tty.dim("openai")} ${host(config.openai)} ${tty.dim("· anthropic")} ${host(config.anthropic)} ${tty.dim("· gemini")} ${host(config.gemini)}`;
  const overridden = (["openai", "anthropic", "gemini"] as const).filter(
    (k) => config[k] !== DEFAULTS[k],
  );
  const short = (["openai", "anthropic", "gemini"] as const)
    .map((k) => (config[k] === DEFAULTS[k] ? tty.dim(k) : `${tty.dim(k)} ${host(config[k])}`))
    .join(tty.dim(" · "));
  return pick(
    tty,
    room,
    full,
    overridden.length ? short : `${short} ${tty.dim("(vendor defaults)")}`,
    short,
  );
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

// A row's label is an EYEBROW: uppercase, dim, one column width for all. Letterspacing is
// faked by nothing: inserted spaces would cost columns a URL needs.
const LABEL_W = 13;

/** The longest variant that FITS, never a cut one: a row saying less still says something
 *  true, and terminals are 62 columns wide as often as 120. */
function pick(tty: Tty, width: number, ...variants: string[]): string {
  return variants.find((v) => tty.width(tty.strip(v)) <= width) ?? (variants.at(-1) as string);
}

export function renderBanner(tty: Tty, config: ProxyConfig, d: BannerData): string[] {
  const url = `http://${config.host}:${config.port}`;
  const label = (s: string) => tty.dim(tty.pad(s.toUpperCase(), LABEL_W));
  // What a row's text actually has: the block, minus the frame and the label column.
  const room = blockWidth(tty) - 4 - LABEL_W;
  const rows = [
    // The mechanism first: a card that opens on settings never says what the thing DOES.
    `${label("round trip")}${pick(tty, room, flow(tty, true), flow(tty, false), `${tty.pill(HUE_HEX.violet, INK_HEX, "masked")} ${tty.dim("▸")} ${tty.pill(HUE_HEX.mint, INK_HEX, "restored")}`)}`,
    `${label("")}${tty.dim(pick(tty, room, "the model only sees substitutes — the reply comes back real", "the model only sees substitutes", "substitutes only"))}`,
    `${label("masking")}${tty.bold(config.level)} ${tty.dim("·")} ${pick(
      tty,
      room - config.level.length - 3,
      modelLabel(tty, d.model, true),
      d.model === "rules" ? tty.dim("pattern rules only") : modelLabel(tty, d.model, false),
      modelLabel(tty, d.model, false),
    )}`,
  ];
  // An URL or an `export` line is USED, not read: cut, it stops working. It gets the label's
  // room when it fits, the frame's when it does not, and the space UNDER the card otherwise.
  const tail: string[] = [];
  const left = inClearPhrase(d.inClear ?? [], room - "left in clear: ".length);
  if (left) rows.push(`${label("")}${tty.fg(HUE_HEX.amber, `left in clear: ${left}`)}`);
  rows.push(`${label("upstreams")}${upstreams(tty, config, room)}`);
  const dials = [
    config.always.length ? `${config.always.length} always-masked` : "",
    config.keep.length ? `${config.keep.length} kept in clear` : "",
    config.disabledKinds.length ? `${config.disabledKinds.join(", ")} left in clear` : "",
  ].filter(Boolean);
  if (dials.length) rows.push(`${label("")}${tty.dim(dials.join(" · "))}`);
  // What a level above `standard` costs, said where the level is chosen: the model reasons
  // on substitutes, so an answer ABOUT a person or an organisation can come out different.
  if (config.level !== "standard")
    rows.push(
      `${label("")}${pick(
        tty,
        room,
        `${tty.fg(HUE_HEX.amber, "names, companies, places replaced")} ${tty.dim("→ answers about them may differ")}`,
        tty.fg(HUE_HEX.amber, "names and companies replaced — answers may differ"),
      )}`,
    );
  if (d.mcp) {
    const writes =
      d.mcp.writes === "confirm"
        ? "a write asks here"
        : d.mcp.writes === "deny"
          ? tty.fg(HUE_HEX.mint, "writes refused")
          : tty.fg(HUE_HEX.amber, "writes pass unasked");
    rows.push(
      `${label("integrations")}${
        d.mcp.servers.length
          ? `${tty.bold(d.mcp.servers.join(" · "))} ${tty.dim(`· ${writes}`)}`
          : tty.dim("none connected")
      }`,
    );
    rows.push(
      `${label("")}${
        d.mcp.client
          ? tty.dim(
              pick(
                tty,
                room,
                `${d.mcp.client} runs with this as its ONLY MCP  ${d.mcp.url}`,
                `${d.mcp.client}'s only MCP  ${d.mcp.url}`,
                d.mcp.url,
              ),
            )
          : tty.dim(pick(tty, room, `agent MCP endpoint  ${d.mcp.url}`, d.mcp.url))
      }`,
    );
  }
  if (d.console) {
    const caption = d.console.reveal
      ? `${tty.pill(HUE_HEX.amber, INK_HEX, "real values")}${
          tty.width(d.console.url) <= room
            ? tty.dim(" on that page only · --no-console-reveal hides them")
            : ""
        }`
      : tty.dim(
          pick(
            tty,
            room,
            "substitutes and counts · --no-console-reveal is on",
            "substitutes and counts",
          ),
        );
    if (tty.width(d.console.url) <= room) {
      rows.push(`${label("live view")}${tty.bold(d.console.url)}`);
      rows.push(`${label("")}${caption}`);
    } else {
      rows.push(`${label("live view")}${caption}`);
      tail.push("", `  ${tty.dim("live view")}`, `  ${tty.bold(d.console.url)}`);
    }
  }
  if (d.reveal)
    rows.push(
      `${label("reveal")}${tty.fg(
        HUE_HEX.amber,
        pick(
          tty,
          room,
          "real values printed below — this screen only, never the log",
          "real values below — this screen only",
          "real values below",
        ),
      )}`,
    );
  if (!d.compact) {
    rows.push(
      "",
      `${label("point a tool")}${tty.dim(pick(tty, room, "in its shell — or press c to copy", "press c to copy"))}`,
    );
    // Same rule as the URL above: these lines are pasted into a shell. When the label column
    // costs them their tail the column goes; when the FRAME would cost them their tail, they
    // go under it, where nothing clips them.
    const envs = envLines(url);
    const inner = blockWidth(tty) - 4;
    if (envs.every((l) => tty.width(l) <= room))
      for (const l of envs) rows.push(`${label("")}${l}`);
    else if (envs.every((l) => tty.width(l) + 2 <= inner))
      for (const l of envs) rows.push(`  ${l}`);
    else tail.push("", ...envs.map((l) => `  ${l}`));
  }
  // The level and what the model sees are the two dials the keys turn: they ride the rule
  // itself, where the eye lands first, rather than becoming one row among the others.
  return [
    ...renderLockup(tty, { version: d.version, url }),
    "",
    ...frame(
      tty,
      tty.pill(tty.theme.brand, tty.theme.inkOnBrand, config.level.toUpperCase()),
      tty.dim(`the model sees ${config.mode === "token" ? "tokens" : "fakes"}`),
      rows,
    ),
    ...tail,
  ];
}
