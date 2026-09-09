// What the operator sees: the card at start, one line per relayed request with a pastel pill
// per category, and a sticky footer carrying the live dials and the keys. Counts per
// category, the route, the status, the time to the upstream's answer — never a value, never a
// header, never a query string. `--json` swaps all of it for one JSON object per line.
import type { RedactionMatch } from "@openmasq/redact";
import type { ProxyConfig } from "../../config/config.js";
import { tally } from "../masker.js";
import {
  type BannerData,
  blockWidth,
  keyHintLine,
  type KeyHint,
  modelLabel,
  type ModelState,
  renderBanner,
} from "./banner.js";
import { HUE_HEX, INK_HEX } from "./palette.js";
import { categoryPills, categoryTag, statusHex } from "./pills.js";
import { createStatusBar } from "./status.js";
import { colorsWanted, createTty, formatDuration, formatMs, type Tty } from "./tty.js";

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

export interface Reporter {
  note(text: string, tone?: "info" | "warn" | "ok"): void;
  banner(config: ProxyConfig, data: BannerData): void;
  keys(hints: KeyHint[]): void;
  request(e: RequestEvent): void;
  /** The vault's KEYS — what the model saw. A diagnostic, never a real value. */
  fakes(keys: string[]): void;
  error(status: number, message: string, cause?: string): void;
  summary(stats?: Stats): void;
  stats(): Stats;
  /** A spinner while something loads; the returned function ends it. */
  spinner(text: string): () => void;
  clear(): void;
  /** Erase the footer and restore the cursor. */
  stop(): void;
}

export interface ReporterOptions {
  write?: (line: string) => void;
  colors?: boolean;
  json?: boolean;
  /** Errors only. */
  quiet?: boolean;
  /** Mutable on purpose: the `f` key flips it at runtime. Printing the real value behind
   *  each substitute is opt-in, terminal-only, and `config.ts` refuses it anywhere kept. */
  reveal?: { on: boolean };
  now?: () => number;
  /** The sticky footer, on an interactive terminal only. */
  live?: { dials: () => Dials; hints: KeyHint[] };
}

export function createReporter(o: ReporterOptions = {}): Reporter {
  const colors = o.colors ?? colorsWanted();
  const tty = createTty(colors);
  const now = o.now ?? Date.now;
  const state: Stats = { requests: 0, totals: {}, startedAt: now() };
  const live = o.live && !o.json && !o.write;
  const bar = createStatusBar(
    process.stderr,
    () => footer(tty, state, o.live?.dials(), o.live?.hints ?? [], now() - state.startedAt),
    !!live && colors,
  );
  const write = o.write ?? ((l: string) => bar.log(l));
  const clock = () => {
    const d = new Date(now());
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  };

  return {
    note(text, tone = "info") {
      if (o.json) return;
      if (tone === "warn") write(`  ${tty.pill(HUE_HEX.amber, INK_HEX, "!")} ${text}`);
      else if (tone === "ok") write(`  ${tty.fg(HUE_HEX.mint, "✓")} ${text}`);
      else write(`  ${tty.dim(text)}`);
    },

    banner(config, data) {
      if (o.json) return;
      write("");
      for (const l of renderBanner(tty, config, data)) write(l);
      write("");
      if (data.keys?.length && !bar.live) write(keyHintLine(tty, data.keys));
      bar.render();
    },

    keys(hints) {
      if (!o.json && !bar.live) write(keyHintLine(tty, hints));
    },

    request(e) {
      state.requests++;
      const counts = tally(e.matches);
      for (const [k, n] of Object.entries(counts)) state.totals[k] = (state.totals[k] ?? 0) + n;
      if (o.json) {
        write(
          JSON.stringify({
            t: new Date(now()).toISOString(),
            method: e.method,
            path: e.path,
            family: e.family,
            status: e.status,
            ms: Math.round(e.ms),
            masked: e.matches.length,
            categories: counts,
            stream: e.stream,
            ...(e.session ? { session: e.session } : {}),
          }),
        );
        return;
      }
      if (o.quiet) return;
      write(
        tty.fit(
          `  ${tty.dim(clock())}  ${tty.pill(statusHex(e.status), INK_HEX, String(e.status))} ${tty.pad(tty.dim(formatMs(e.ms)), 6)} ` +
            `${tty.bold(e.method)} ${e.path}  ${tty.dim(e.family)}${e.stream ? tty.dim("  ⇢ stream") : ""}${e.session ? tty.dim(`  session ${e.session}`) : ""}`,
          undefined,
          "middle",
        ),
      );
      const total = e.matches.length;
      // A relayed GET/HEAD carried no text: one line, not two — a client's health probe
      // must not read like a request that had nothing sensitive in it.
      if (!total && e.method !== "POST" && e.method !== "TOOL") return;
      write(
        `            ${total ? `${categoryPills(tty, counts)}  ${tty.dim(`${total} masked`)}` : tty.dim("nothing to mask")}`,
      );
      if (o.reveal?.on) for (const l of revealLines(tty, e.matches)) write(l);
    },

    fakes(keys) {
      if (o.json || o.quiet || !process.env.OPENMASQ_PROXY_DEBUG_FAKES) return;
      write(tty.fit(`            ${tty.dim(`the model saw: ${keys.join(" | ")}`)}`));
    },

    error(status, message, cause) {
      if (o.json) {
        write(
          JSON.stringify({
            t: new Date(now()).toISOString(),
            error: status,
            message,
            ...(cause ? { cause } : {}),
          }),
        );
        return;
      }
      write(
        tty.fit(
          `  ${tty.dim(clock())}  ${tty.pill(HUE_HEX.red, INK_HEX, String(status))} ${message}${cause ? tty.dim(` — ${cause}`) : ""}`,
        ),
      );
    },

    summary(s = state) {
      if (o.json) return;
      bar.stop();
      const masked = Object.values(s.totals).reduce((a, b) => a + b, 0);
      const p = categoryPills(tty, s.totals);
      const line =
        `  ${tty.bold(String(s.requests))} request${s.requests === 1 ? "" : "s"} ${tty.dim("·")} ${tty.bold(String(masked))} value${masked === 1 ? "" : "s"} masked` +
        `${p ? `  ${p}` : ""} ${tty.dim("·")} ${tty.dim(formatDuration(now() - s.startedAt))}`;
      process.stderr.write(`\n${line}\n\n`);
      bar.render();
    },

    stats: () => ({ ...state, totals: { ...state.totals } }),
    spinner: (text) => bar.spinner(text),

    clear() {
      if (!o.json && colors) process.stderr.write("[2J[3J[H");
      bar.render();
    },

    stop: () => bar.stop(),
  };
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
  const out = rows.slice(0, REVEAL_MAX).map((m) => {
    const tag = tty.pad(categoryTag(tty, m.category ?? m.type), 12);
    const note = m.uncertain ? tty.dim("  · to check") : "";
    return tty.fit(
      `            ${tag} ${m.value} ${tty.dim("→")} ${tty.dim(m.placeholder)}${note}`,
    );
  });
  if (rows.length > out.length)
    out.push(`            ${tty.dim(`+${rows.length - out.length} more`)}`);
  return out;
}

/** The footer's three lines: a rule, the live dials and counts, the keys. */
function footer(
  tty: Tty,
  s: Stats,
  dials: Dials | undefined,
  hints: KeyHint[],
  uptime: number,
): string[] {
  const masked = Object.values(s.totals).reduce((a, b) => a + b, 0);
  const sep = tty.dim(" · ");
  const left = dials
    ? [
        tty.bold(dials.level),
        dials.mode === "token" ? "tokens" : "fakes",
        modelLabel(tty, dials.model, false),
      ].join(sep)
    : "";
  const counts = `${tty.bold(String(s.requests))} req${sep}${tty.bold(String(masked))} masked`;
  const pills = categoryPills(tty, s.totals, 3);
  return [
    `  ${tty.dim("─".repeat(blockWidth(tty)))}`,
    tty.fit(
      `  ${left}${sep}${counts}${pills ? `  ${pills}` : ""}${sep}${tty.dim(formatDuration(uptime))}`,
    ),
    tty.fit(keyHintLine(tty, hints)),
  ];
}

export const silentReporter: Reporter = {
  note() {},
  banner() {},
  keys() {},
  request() {},
  fakes() {},
  error() {},
  summary() {},
  stats: () => ({ requests: 0, totals: {}, startedAt: 0 }),
  spinner: () => () => {},
  clear() {},
  stop() {},
};
