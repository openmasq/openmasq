// Per-tool-call watchdog for the agentic MCP loop, pulled out of `mcpAgent.ts`
// (the folder's over-cap file — pure siblings only, see agent/CLAUDE.md).
//
// Two jobs, both about a SINGLE dispatch (`client.callTool` / an awaited prefetch):
//  1. SOFT ticks while the call runs, so the live trace row evolves ("· 47 s")
//     instead of freezing on one narration line for a 3-minute browser load.
//  2. A HARD per-class timeout, so a hung tool (a page that never loads, a wedged
//     server) becomes a CLASSIFIED error instead of blocking the turn until the
//     user presses Stop. The `TTFT_WATCHDOG_MS` in the loop covers a stalled MODEL
//     call; this covers the stalled TOOL call — the other half of the same promise.
//
// The timeout error's message deliberately contains "Délai dépassé", which
// `classifyToolError` already maps to `transport` — so a timeout feeds the
// EXISTING self-correction + `MAX_CONSECUTIVE_DEAD` machinery; no new exit path.
// Like `raceAbort`, losing the race does NOT cancel the dispatch (MCP has no
// cancel channel): the work may finish in the background and its result is dropped.

/** A tool dispatch exceeded its hard budget. `message` is wire-safe by
 *  construction: the BARE tool name and a duration, never an argument value. */
export class ToolTimeoutError extends Error {
  constructor(bareTool: string, timeoutMs: number) {
    super(`Délai dépassé : \`${bareTool}\` n'a pas répondu en ${Math.round(timeoutMs / 1000)} s.`);
    this.name = "ToolTimeoutError";
  }
}

// Hard budgets per tool class. Deliberately GENEROUS: a false-positive timeout
// converts a legitimately slow success into a failure, which is worse than late.
// The soft ticks are what keep the wait honest; the hard stop is the backstop.
const BROWSER_NAV_TIMEOUT_MS = 90_000; // page load + accessibility snapshot
const BROWSER_TOOL_TIMEOUT_MS = 60_000; // click / type / snapshot on a LOADED page
const DEFAULT_TOOL_TIMEOUT_MS = 120_000; // connector calls (a big Drive export is slow)

/** The hard budget for a namespaced tool name. Keyed on the `browser_*` bare-name
 *  convention (like `isBrowser` in the redaction policy), so a third-party
 *  browser-automation connector gets browser budgets too. `run_python` never
 *  reaches the dispatch site (intercepted) — no case for it here. */
export function toolTimeoutMs(namespacedTool: string): number {
  const px = namespacedTool.indexOf("__");
  const bare = px > 0 ? namespacedTool.slice(px + 2) : namespacedTool;
  if (/^browser_(navigate|tabs)/.test(bare)) return BROWSER_NAV_TIMEOUT_MS;
  if (bare.startsWith("browser_")) return BROWSER_TOOL_TIMEOUT_MS;
  return DEFAULT_TOOL_TIMEOUT_MS;
}

/** "47 s" under a minute, "2 min 05" above — short enough for a trace row. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
}

/**
 * The live status line for an in-flight call: the narration (or nothing) plus the
 * elapsed time, plus an honest "réponse lente" once 60% of the hard budget is
 * burned — the user learns the call may be abandoned BEFORE it is. Wire-safe as
 * long as `base` is (the narration already sees only WIRE args).
 */
export function liveToolStatus(
  base: string | undefined,
  elapsedMs: number,
  timeoutMs: number,
): string {
  const parts = [base || "en cours", formatElapsed(elapsedMs)];
  if (elapsedMs >= timeoutMs * 0.6) parts.push("réponse lente");
  return parts.join(" · ");
}

/**
 * Race `work` against a hard timeout, emitting a soft tick every `tickMs` while
 * it runs. Settles exactly once; all timers are cleared on the FIRST settle
 * (win, error, or timeout), so an abandoned loser never leaks an interval.
 * `work`'s late rejection after a timeout is observed (no unhandled rejection).
 */
export function watchToolCall<T>(
  work: Promise<T>,
  opts: {
    bareTool: string;
    timeoutMs: number;
    /** Soft-tick period. Default 5 s — coarse enough to be cheap, alive enough to read. */
    tickMs?: number;
    onTick?: (elapsedMs: number) => void;
  },
): Promise<T> {
  const tickMs = opts.tickMs ?? 5_000;
  const t0 = Date.now();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const tick = setInterval(() => {
      if (!settled) opts.onTick?.(Date.now() - t0);
    }, tickMs);
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(tick);
      clearTimeout(hard);
      fn();
    };
    const hard = setTimeout(
      () => settle(() => reject(new ToolTimeoutError(opts.bareTool, opts.timeoutMs))),
      opts.timeoutMs,
    );
    work.then(
      (v) => settle(() => resolve(v)),
      (e) => settle(() => reject(e)),
    );
  });
}
