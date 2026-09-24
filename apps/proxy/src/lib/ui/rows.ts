// One relayed request, as two lines. What is printed: counts per category, the route, the
// status, the time to the upstream's answer, and where it went — never a value, never a
// header, never a query string. The reveal lines are the ONE exception, and they only ever
// reach an operator's own terminal (`reporter.ts` says under which conditions).
import type { RedactionMatch } from "@openmasq/redact";
import { HUE_HEX, INK_HEX } from "./palette.js";
import { categoryTag, statusHex } from "./pills.js";
import { histogram } from "./spark.js";
import { formatMs, type Tty } from "./tty.js";

export interface RequestEvent {
  method: string;
  path: string;
  family: string;
  status: number;
  /** Time to the upstream's answer (headers), in ms. */
  ms: number;
  matches: RedactionMatch[];
  stream: boolean;
  session?: string;
}

/**
 * The gutter answers the reader's one question before a word is read: did anything of mine
 * leave, and did it leave protected? Mint = something was masked. Slate = nothing to mask.
 * Amber and red are the upstream's own answer, which outranks both — a masked request that
 * failed is a failure first.
 */
export function outcomeHex(e: RequestEvent): string {
  if (e.status >= 500) return HUE_HEX.red;
  if (e.status >= 300) return HUE_HEX.amber;
  return e.matches.length ? HUE_HEX.mint : HUE_HEX.slate;
}

const GLYPH = "▌";

export interface RowOptions {
  clock: string;
  counts: Record<string, number>;
  /** The host the request was forwarded to, when the card taught the reporter which it is. */
  upstream?: string;
}

export function requestLines(tty: Tty, e: RequestEvent, o: RowOptions): string[] {
  const hue = outcomeHex(e);
  const gutter = tty.fg(hue, GLYPH);
  const cont = tty.dim(tty.fg(hue, GLYPH));
  const dest = o.upstream ?? e.family;
  const head = tty.fit(
    `  ${gutter} ${tty.dim(o.clock)}  ${tty.pill(statusHex(e.status), INK_HEX, String(e.status))} ${tty.pad(tty.dim(formatMs(e.ms)), 6)} ` +
      `${tty.bold(e.method)} ${e.path}  ${tty.dim(`⟶ ${dest}`)}${e.stream ? tty.dim("  ⇢ stream") : ""}${e.session ? tty.dim(`  session ${e.session}`) : ""}`,
    undefined,
    "middle",
  );
  const total = e.matches.length;
  // A relayed GET/HEAD carried no text: one line, not two — a client's health probe must not
  // read like a request that had nothing sensitive in it.
  if (!total && e.method !== "POST" && e.method !== "TOOL") return [head];
  const bars = histogram(tty, o.counts, 6);
  const body = total
    ? `${bars ? `${bars}  ` : ""}${pillsOf(tty, o.counts)}  ${tty.dim(`${total} masked`)}`
    : tty.dim("nothing to mask");
  return [head, `  ${cont} ${body}`];
}

function pillsOf(tty: Tty, counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => categoryTag(tty, k, ` ${n}`))
    .join(" ");
}

/** How many spans a single request prints before it is summarised. */
const REVEAL_MAX = 10;

/**
 * What was substituted, one line per distinct value: the category, the real value, and what
 * the model received instead. This is the only place the proxy prints a real value, and only
 * on an operator's own terminal (`--reveal`, or the `f` key).
 */
export function revealLines(tty: Tty, matches: RedactionMatch[]): string[] {
  const seen = new Map<string, RedactionMatch>();
  for (const m of matches) if (!seen.has(m.value)) seen.set(m.value, m);
  const rows = [...seen.values()];
  const indent = `      ${tty.dim(tty.fg(HUE_HEX.slate, GLYPH))} `;
  const out = rows.slice(0, REVEAL_MAX).map((m) => {
    const tag = tty.pad(categoryTag(tty, m.category ?? m.type), 12);
    const note = m.uncertain ? tty.dim("  · to check") : "";
    return tty.fit(`${indent}${tag} ${m.value} ${tty.dim("→")} ${tty.dim(m.placeholder)}${note}`);
  });
  if (rows.length > out.length)
    out.push(`${indent}${tty.dim(`+${rows.length - out.length} more`)}`);
  return out;
}
