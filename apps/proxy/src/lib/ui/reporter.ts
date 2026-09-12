// What the operator sees: the lockup and the card at start, two lines per relayed request,
// and a sticky footer carrying the live dials, the running counts and the keys. The lines
// themselves are drawn by `rows.ts`, the footer by `footer.ts`; this file owns the STATE they
// read — the totals, the recent outcomes, and the upstreams the card taught it.
// `--json` swaps all of it for one JSON object per line.
import type { ProxyConfig } from "../../config/config.js";
import { tally } from "../masker.js";
import { type BannerData, type KeyHint, keyHintLine, renderBanner } from "./banner.js";
import { ACTIVITY_MAX, type Dials, footerLines, type Stats } from "./footer.js";
import { HUE_HEX, INK_HEX } from "./palette.js";
import { categoryPills } from "./pills.js";
import { outcomeHex, type RequestEvent, requestLines, revealLines } from "./rows.js";
import { histogram } from "./spark.js";
import { createStatusBar } from "./status.js";
import {
  colorsWanted,
  createTty,
  formatDuration,
  SCREEN,
  type Tty,
  type TtyOptions,
} from "./tty.js";

export interface Reporter {
  note(text: string, tone?: "info" | "warn" | "ok"): void;
  /** Resolves once the card is fully on screen. It is written line by line on a terminal
   *  (`pace`), so a caller with something to print AFTER it has to wait for it. */
  banner(config: ProxyConfig, data: BannerData): Promise<void>;
  /** Any other card, drawn with this reporter's own terminal and paced like the banner —
   *  the join card (`joinCard.ts`) is one. */
  card(render: (tty: Tty) => string[]): Promise<void>;
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

export interface ReporterOptions extends TtyOptions {
  write?: (line: string) => void;
  colors?: boolean;
  json?: boolean;
  /** Errors only. */
  quiet?: boolean;
  /** Mutable on purpose: the `f` key flips it at runtime. Printing the real value behind
   *  each substitute is opt-in, terminal-only, and `config.ts` refuses it anywhere kept. */
  reveal?: { on: boolean };
  now?: () => number;
  /** Milliseconds between two lines of the card. Defaults to a budget spread over however
   *  many lines the card has; 0 writes it in one go (a file, a machine, a test). */
  pace?: number;
  /** The sticky footer, on an interactive terminal only. */
  live?: { dials: () => Dials; hints: KeyHint[] };
}

/** How long the masked total stays accented after it moves. One repaint, then it settles. */
const FLASH_MS = 900;

/** The card is REVEALED, not dropped: it lands line by line, within the budget below whatever
 *  its length — a card carrying the integrations rows would otherwise crawl. It follows an
 *  opening sequence that took its time, and a block appearing whole after it reads as a glitch. */
const REVEAL_MS = 520;

export function createReporter(o: ReporterOptions = {}): Reporter {
  /** Line by line on a terminal, in one go elsewhere — set up below, once `write` exists. */
  let reveal: (lines: string[]) => Promise<void> = async () => {};
  const colors = o.colors ?? colorsWanted();
  const tty = createTty(colors, undefined, o);
  const now = o.now ?? Date.now;
  const state: Stats = { requests: 0, totals: {}, startedAt: now() };
  // The strip and the flash are the footer's memory; they live here because the footer is
  // rebuilt from scratch on every repaint.
  const recent: string[] = [];
  let maskedAt = 0;
  // Which host each family goes to. Learned from the card the reporter printed rather than
  // threaded through every call site: the config that answers it is the same one, and a
  // reporter that never printed a card (a log file) simply names the family instead.
  let upstreams: Record<string, string> = {};
  const live = o.live && !o.json && !o.write;
  const bar = createStatusBar(
    process.stderr,
    () =>
      footerLines(tty, state, o.live?.dials(), o.live?.hints ?? [], now() - state.startedAt, {
        recent,
        flash: now() - maskedAt < FLASH_MS,
      }),
    !!live && colors,
  );
  const write = o.write ?? ((l: string) => bar.log(l));
  // Only an operator's own terminal gets the reveal: a log file, a pipe and a machine stream
  // are read after the fact, where a delay buys nothing and an interleaved write costs.
  const paced = !o.json && !o.write && colors && !!process.stderr.isTTY;
  reveal = async (lines) => {
    const step = o.pace ?? (paced ? Math.max(12, Math.round(REVEAL_MS / lines.length)) : 0);
    for (const l of lines) {
      write(l);
      if (step) await wait(step);
    }
    bar.render();
  };
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

    async banner(config, data) {
      if (o.json) return;
      upstreams = hostsOf(config);
      const lines = ["", ...renderBanner(tty, config, data), ""];
      if (data.keys?.length && !bar.live) lines.push(keyHintLine(tty, data.keys));
      await reveal(lines);
    },

    async card(render) {
      if (o.json) return;
      await reveal(["", ...render(tty), ""]);
    },

    keys(hints) {
      if (!o.json && !bar.live) write(keyHintLine(tty, hints));
    },

    request(e) {
      state.requests++;
      const counts = tally(e.matches);
      for (const [k, n] of Object.entries(counts)) state.totals[k] = (state.totals[k] ?? 0) + n;
      if (e.matches.length) maskedAt = now();
      recent.push(outcomeHex(e));
      if (recent.length > ACTIVITY_MAX) recent.shift();
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
      for (const l of requestLines(tty, e, {
        clock: clock(),
        counts,
        upstream: upstreams[e.family],
      }))
        write(l);
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
          `  ${tty.fg(HUE_HEX.red, "▌")} ${tty.dim(clock())}  ${tty.pill(HUE_HEX.red, INK_HEX, String(status))} ${message}${cause ? tty.dim(` — ${cause}`) : ""}`,
        ),
      );
    },

    summary(s = state) {
      if (o.json) return;
      bar.stop();
      const masked = Object.values(s.totals).reduce((a, b) => a + b, 0);
      const h = histogram(tty, s.totals, 6);
      const p = categoryPills(tty, s.totals);
      const line =
        `  ${tty.bold(String(s.requests))} request${s.requests === 1 ? "" : "s"} ${tty.dim("·")} ${tty.bold(String(masked))} value${masked === 1 ? "" : "s"} masked` +
        `${h ? `  ${h}` : ""}${p ? `  ${p}` : ""} ${tty.dim("·")} ${tty.dim(formatDuration(now() - s.startedAt))}`;
      process.stderr.write(`\n${line}\n\n`);
      bar.render();
    },

    stats: () => ({ ...state, totals: { ...state.totals } }),
    spinner: (text) => bar.spinner(text),

    clear() {
      if (!o.json && colors) process.stderr.write(SCREEN.clear);
      bar.render();
    },

    stop: () => bar.stop(),
  };
}

/** The card names an upstream per family; the request lines then say where each one went. */
function hostsOf(config: ProxyConfig): Record<string, string> {
  const host = (origin: string) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  };
  return {
    openai: host(config.openai),
    anthropic: host(config.anthropic),
    gemini: host(config.gemini),
  };
}

/**
 * The reveal toggle a reporter may be given. A reporter whose output is a FILE gets a toggle
 * that is off and stays off — a log is copied, backed up and grepped, and `--reveal` with a
 * wrapped tool is allowed only because the console page is the screen then, never the file.
 * One decision, here, rather than a condition at each construction site.
 */
export function revealFor(reveal: { on: boolean }, out: { toFile: boolean }): { on: boolean } {
  return out.toFile ? { on: false } : reveal;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const silentReporter: Reporter = {
  note() {},
  async card() {},
  banner: async () => {},
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
