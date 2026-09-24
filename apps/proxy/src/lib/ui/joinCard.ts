// The card of a session that JOINS a proxy already running — the same lockup and the same
// frame as the start-up card (`banner.ts`), with the rows a joiner actually has: which proxy,
// under which masking, as which session, and the live view that proxy serves. Three green
// ticks and an amber paragraph were the previous rendering; a second `-- claude` deserves the
// screen the first one got.
import type { Running } from "../attach.js";
import { blockWidth, frame, modelLabel } from "./banner.js";
import { inClearPhrase } from "./kinds.js";
import { renderLockup } from "./mark.js";
import { HUE_HEX, INK_HEX } from "./palette.js";
import type { Tty } from "./tty.js";

export interface JoinData {
  url: string;
  running: Running;
  /** This client's session name — the console's Session column, `claude-a5cb`. */
  session: string;
  /** The wrapped tool. */
  tool: string;
  /** The running proxy's live view, when it published one. */
  link?: string;
  /** Start-only flags this join could not honour. */
  ignored?: string[];
}

const LABEL_W = 13;

export function renderJoinCard(tty: Tty, d: JoinData): string[] {
  const label = (s: string) => tty.dim(tty.pad(s.toUpperCase(), LABEL_W));
  const room = blockWidth(tty) - 4 - LABEL_W;
  const r = d.running;
  const level = r.level ?? "";
  const rows: string[] = [];
  const tail: string[] = [];

  rows.push(`${label("proxy")}${tty.bold(d.url)} ${tty.dim(`· v${r.version} · already running`)}`);
  rows.push(
    `${label("masking")}${level ? `${tty.bold(level)} ${tty.dim("·")} ` : ""}${modelLabel(tty, r.model ? "on" : level === "standard" || !level ? "rules" : "off", room > 60)}`,
  );
  const left = inClearPhrase(r.disabled ?? [], room - "left in clear: ".length);
  if (left) rows.push(`${label("")}${tty.fg(HUE_HEX.amber, `left in clear: ${left}`)}`);
  rows.push(
    `${label("session")}${tty.bold(d.session)} ${tty.dim(`· ${d.tool} runs through this proxy, its own vault`)}`,
  );
  // The URL is USED, not read: it goes where nothing cuts it — the label's room when it
  // fits, under the card when it does not (the same rule as the start-up card).
  if (d.link) {
    if (tty.width(d.link) <= room) {
      rows.push(`${label("live view")}${tty.bold(d.link)}`);
      rows.push(`${label("")}${tty.dim("that proxy's page · openmasq-proxy console reopens it")}`);
    } else {
      rows.push(`${label("live view")}${tty.dim("below · openmasq-proxy console reopens it")}`);
      tail.push("", `  ${d.link}`);
    }
  } else if (r.console === false || r.pid === undefined) {
    // It serves none, or it is an older build that published no link: either way there is
    // nothing this session can open.
    rows.push(
      `${label("live view")}${tty.fg(HUE_HEX.amber, r.console === false ? "none — that proxy runs without --console" : "none published — that proxy is an older build")}`,
    );
  } else {
    rows.push(
      `${label("live view")}${tty.dim("if that proxy serves one: openmasq-proxy console")}`,
    );
  }
  if (d.ignored?.length) {
    // Never cut mid-sentence: the long form when it fits, the short one otherwise. And HOW
    // to stop the running proxy, when it said its pid — the operator who typed `--open`
    // wants a live view, and the way to one is a proxy of their own.
    const stop = r.pid ? `kill ${r.pid}` : "stop it";
    const short = `${d.ignored.join(", ")} ignored — a join starts no server`;
    const long = `${short} · ${stop}, then re-run to start your own`;
    rows.push(`${label("")}${tty.fg(HUE_HEX.amber, tty.width(long) <= room ? long : short)}`);
    if (tty.width(long) > room)
      rows.push(`${label("")}${tty.fg(HUE_HEX.amber, `${stop}, then re-run to start your own`)}`);
  }

  return [
    ...renderLockup(tty, { version: r.version, url: d.url }),
    "",
    ...frame(
      tty,
      tty.pill(HUE_HEX.mint, INK_HEX, "JOINED"),
      tty.dim("one proxy, one console, every client"),
      rows,
    ),
    ...tail,
  ];
}
