/**
 * The ANTIGRAVITY-specific part (`agy -p`) of the subscription engine: the user's own
 * installed CLI. Loop: `spawnStream.ts`; events: `antigravityStream.ts`; the TOOLED turn:
 * `antigravityToolsTurn.ts`.
 *
 * ## The flags
 * - `--output-format stream-json`: NDJSON with REAL text increments.
 * - `--print-timeout`: pushed out; the app's Stop (SIGTERM) is the real cancellation.
 * - `--disable-slash-commands`: the turn's text is the USER's, never a command surface.
 * - `--app_data_dir=<relative>` (UNDOCUMENTED, relative to `~/.gemini`, absolute refused):
 *   OUR settings apply instead of the user's, the conversation leaves no trace in their
 *   history, and auth keeps working (creds stay in the base dir).
 * - `--add-dir <dir>` (TOOLED turn only): the ONLY way print mode discovers a workspace
 *   plugin; a plugin in the bare cwd is never read. The plugin lives in a disposable folder
 *   of ours, so the user's global MCP config is never touched (rule 11).
 *
 * ## Permissions: what holds the isolation
 * In headless mode every permissioned tool is AUTO-DENIED. What is permitted is EXACTLY
 * the `permissions.allow` of our settings.json: ONE rule, `mcp(<bridge>/*)`, rewritten on
 * every turn (so two concurrent turns can't clobber each other's settings).
 *
 * ⚠️ NEVER pass `--dangerously-skip-permissions`: it hands the model the user's machine.
 * ⚠️ The CLI still ADVERTISES its built-in tools at `init`: the perimeter holds by
 * PERMISSION, not by advertisement, so `toolGate.ts` is not applied here. Reads INSIDE the
 * workspace need no permission, hence an empty disposable workspace holding only the
 * plugin; the bridge's token there dies with the turn and no tool can carry it out.
 * ⚠️ ACCEPTED RESIDUAL: the user's GLOBAL MCP servers are still read. Nothing grants them,
 * unless the user named one of their own after the bridge. Their server, their machine.
 *
 * No `--model`: the account's default, since the CLI's ids rotate with the offer.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretAntigravityEvent } from "./antigravityStream";
import { streamCliProcess } from "./spawnStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";

/** The isolated data dir, RELATIVE to `~/.gemini`. One stable name: the isolation comes
 *  from it not being THEIRS, not from a name per turn. */
export const ANTIGRAVITY_APP_DATA_DIR = ".openmasq-cli";

/** The ONE permission rule: the app's bridge, nothing else (`mcp(server/tool)` grammar). */
export const ANTIGRAVITY_BRIDGE_RULE = `mcp(${TOOLS_SERVER_NAME}/*)`;

/** Written before every turn, so a hand-edit can never leave a wider grant behind. */
export const ANTIGRAVITY_SETTINGS = { permissions: { allow: [ANTIGRAVITY_BRIDGE_RULE] } };

/** Print mode's own ceiling. The app's Stop is the real cancellation. */
const PRINT_TIMEOUT = "60m";

export interface AntigravityTurnOptions {
  /** Absolute path resolved by `resolveCli`. */
  binPath: string;
  /** The flattened turn — system prompt ALREADY prefixed (`bridge.ts` promptWithSystem). */
  prompt: string;
  /** DEDICATED and neutral working directory — never one of the user's folders. */
  cwd: string;
  signal?: AbortSignal;
}

export function buildAntigravityArgs(opts: {
  prompt: string;
  /** TOOLED turn: the disposable folder holding the bridge's plugin (header, `--add-dir`). */
  addDir?: string;
}): string[] {
  return [
    "--app_data_dir=" + ANTIGRAVITY_APP_DATA_DIR,
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--print-timeout",
    PRINT_TIMEOUT,
    ...(opts.addDir ? ["--add-dir", opts.addDir] : []),
    "-p",
    opts.prompt,
  ];
}

/** An antigravity turn — same contract as `streamClaudeSubscription`. */
export async function* streamAntigravitySubscription(
  opts: AntigravityTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    binPath: opts.binPath,
    args: buildAntigravityArgs(opts),
    cwd: opts.cwd,
    interpret: interpretAntigravityEvent,
    signal: opts.signal,
  });
}
