/** Turn budget — ADAPTIVE: every turn that makes real forward progress (a tool call that
 *  SUCCEEDS with a NEW result) grants more, up to the hard ceiling; a stuck model earns nothing. */
export const BASE_TURNS = 14;
export const TURNS_PER_PROGRESS = 3;
export const MAX_TURNS_HARD = 40;

/** A STREAMED model call that emits nothing within this budget is stuck in prefill;
 *  rejected with the recognised `MODEL_STALL` marker so the send error stays actionable. */
export const TTFT_WATCHDOG_MS = 45_000;
export const MODEL_STALL_ERROR = "MODEL_STALL";
/** Hard budget for a NON-streamed model turn, which has no first-token signal. Generous:
 *  a slow success beats a false stall. */
export const COMPLETE_TOOLS_TIMEOUT_MS = 120_000;
/** Coalesce streamed-token UI updates: un-redacting the whole reply on EVERY token is O(n²). */
export const STREAM_FLUSH_MS = 40;
/** Hard-stop when ONE tool returns the SAME unproductive result this many times in a turn. */
export const STUCK_STOP = 3;
/** Cross-tool backstop for a loop that never repeats the exact same (tool, result): counted
 *  at most ONCE PER MODEL RESPONSE, reset on any productive call. */
export const MAX_CONSECUTIVE_DEAD = 5;
/** A result meaning the tool could NOT perform the request — as opposed to a valid-but-empty
 *  answer, which is legitimate exploration. */
export const DEAD_END_RE =
  /no matching operation|aucune op[ée]ration correspondante|operation not found|unknown operation|unsupported operation|no such (tool|operation|method|endpoint)/i;
