/**
 * The ANTIGRAVITY-specific part (`agy -p`) of the subscription engine: the user's own
 * installed CLI. Loop: `spawnStream.ts`; events: `antigravityStream.ts`; the TOOLED turn:
 * `antigravityToolsTurn.ts`.
 *
 * ## The flags
 * - `--output-format stream-json`: NDJSON with REAL text increments.
 * - `--print-timeout`: pushed out; the app's Stop (SIGTERM) is the real cancellation.
 * - `--disable-slash-commands`: the turn's text is the USER's, never a command surface.
 * - `--settings <json>` (session only, never saved): `ANTIGRAVITY_SETTINGS`. LAST on the
 *   line on purpose: this CLI's parser STOPS at a flag it does not know and silently drops
 *   the rest (measured on 1.5.10 with the retired `--app_data_dir`: no `stream-json`, the
 *   user's own settings, a file written). A CLI older than `--settings` thus still parses
 *   every flag before it and fails CLOSED (no grant for the bridge).
 * - `--add-dir <dir>` (TOOLED turn only): the ONLY way print mode discovers a workspace
 *   plugin; a plugin in the bare cwd is never read. The plugin lives in a disposable folder
 *   of ours, so the user's global MCP config is never touched (rule 11).
 * - `--input-format stream-json`: the prompt rides on STDIN as ONE `{event:"user"}` line
 *   (`antigravityStdin`), then stdin closes — the documented headless path (« the process
 *   exits after the input pipe is closed and the current turn completes »). Never `-p
 *   <prompt>`: argv is capped by the OS (`spawnFailure.ts`) and readable by `ps`. Same
 *   `init`/`step_update`/`result` output (measured 1.5.10, a 45 000-char turn).
 *
 * ## Permissions: what holds the isolation
 * ⚠️ `agentMode: ""` (Default) IS THE GUARD. Since 1.5 a session with no saved mode —
 * headless included — starts in AUTO, which approves tools itself: measured, without it the
 * model writes a file in the cwd even with our allow-list. In Default, headless AUTO-DENIES
 * every permissioned tool (« a tool required the "write_file" permission that headless
 * mode cannot prompt for »). What is then permitted is our ONE rule, `mcp(<bridge>/*)`.
 *
 * ⚠️ NEVER pass `--dangerously-skip-permissions`: it hands the model the user's machine.
 * ⚠️ The CLI still ADVERTISES its built-in tools at `init`: the perimeter holds by
 * PERMISSION, not by advertisement, so `toolGate.ts` is not applied here. Reads INSIDE the
 * workspace need no permission, hence an empty disposable workspace holding only the
 * plugin; the bridge's token there dies with the turn and no tool can carry it out.
 * ⚠️ ACCEPTED RESIDUALS: the user's GLOBAL MCP servers are still read (nothing grants them,
 * unless one is named after the bridge), and their OWN `settings.json` still applies UNDER
 * ours — an allow-rule they wrote for their sessions holds here too. And with no data-dir
 * flag left, the turn (redacted text only) lands in their CLI history. Their machine.
 *
 * No `--model`: the account's default, since the CLI's ids rotate with the offer.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretAntigravityEvent } from "./antigravityStream";
import { streamCliProcess } from "./spawnStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";

/** The ONE permission rule: the app's bridge, nothing else (`mcp(server/tool)` grammar).
 *  A PLUGIN's server is named `<plugin>_<server>` (measured 1.5.10: `openmasq_openmasq`,
 *  the bare `mcp(openmasq/*)` no longer matched and every bridge call was denied) — and
 *  the plugin is named after the server (`antigravityPluginFiles`). */
export const ANTIGRAVITY_BRIDGE_RULE = `mcp(${TOOLS_SERVER_NAME}_${TOOLS_SERVER_NAME}/*)`;

/** The SESSION's settings (`--settings`, never written to disk): Default mode — the guard,
 *  see the header — and the bridge as the one grant. */
export const ANTIGRAVITY_SETTINGS = { agentMode: "", permissions: { allow: [ANTIGRAVITY_BRIDGE_RULE] } };

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

/** No prompt here: it goes on stdin (`antigravityStdin`, see the header). */
export function buildAntigravityArgs(opts: {
  /** TOOLED turn: the disposable folder holding the bridge's plugin (header, `--add-dir`). */
  addDir?: string;
}): string[] {
  return [
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--print-timeout",
    PRINT_TIMEOUT,
    ...(opts.addDir ? ["--add-dir", opts.addDir] : []),
    "--input-format",
    "stream-json",
    // LAST: an older CLI that does not know it still parses everything above (header).
    "--settings",
    JSON.stringify(ANTIGRAVITY_SETTINGS),
  ];
}

/** The turn as the ONE stdin line streaming input reads: `JSON.stringify` keeps every
 *  newline of the prompt inside the line, so the whole conversation is one message. */
export function antigravityStdin(prompt: string): string {
  return `${JSON.stringify({ event: "user", message: { content: prompt } })}\n`;
}

/** An antigravity turn — same contract as `streamClaudeSubscription`. */
export async function* streamAntigravitySubscription(
  opts: AntigravityTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    cli: "antigravity",
    binPath: opts.binPath,
    args: buildAntigravityArgs({}),
    stdin: antigravityStdin(opts.prompt),
    cwd: opts.cwd,
    interpret: interpretAntigravityEvent,
    signal: opts.signal,
  });
}
