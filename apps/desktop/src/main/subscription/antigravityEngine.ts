/**
 * The ANTIGRAVITY-specific part (`agy -p`) of the subscription engine — the user's
 * Google Antigravity subscription, served by THEIR OWN installed CLI. Loop:
 * `spawnStream.ts`; events: `antigravityStream.ts`; the TOOLED turn's recipe:
 * `antigravityToolsTurn.ts`. Everything below is MEASURED against CLI 1.1.21
 * (31/08/2026) and re-measured against 1.1.23 (01/09/2026), where the tooled turn
 * was found.
 *
 * ## The flags, and why those
 *
 * - `-p <prompt>` + `--output-format stream-json`: NDJSON on stdout, with REAL text
 *   increments (this CLI streams; codex does not).
 * - `--print-timeout`: the print mode's own ceiling. Left at the CLI default would cap a
 *   long turn at 5 min; the app's Stop is the real cancellation (SIGTERM), so we push it
 *   out rather than let a silent timeout truncate an answer.
 * - `--disable-slash-commands`: the turn's text is the USER's, never a command surface.
 *   A message starting with `/` is a message, not an instruction to the CLI.
 * - `--app_data_dir=<relative>`: **the flag that matters**, and it is UNDOCUMENTED (absent
 *   from `--help`, found in the binary and measured). It relocates the CLI's data dir,
 *   RELATIVE to `~/.gemini` — an absolute path is refused (« must not be absolute »).
 *   Measured, it gives what codex gets from `--ignore-user-config`:
 *   · the user's `settings.json` (and its `permissions.allow` rules) is NOT the one that
 *     applies — OURS is (`ANTIGRAVITY_SETTINGS`, rewritten before every turn);
 *   · the conversation, its history and its caches land THERE, not in the user's
 *     `~/.gemini/antigravity-cli/conversations` — an OpenMasq turn leaves no trace in
 *     their personal history;
 *   · **auth keeps working** (creds stay in the base `~/.gemini`) — the exact counterpart
 *     of codex's « auth still uses CODEX_HOME ».
 * - `--add-dir <dir>` (TOOLED turn only): the ONLY way print mode discovers workspace
 *   customizations. Measured on 1.1.23: a `.agents/plugins/<n>/` in the bare cwd is never
 *   read — not with a `.git` at the root, not with the folder trusted, not declared in
 *   `.agents/plugins.json` — while the SAME folder passed through `--add-dir` loads its
 *   plugin, spawns its MCP server and lists its tools. The dir needs no `.git`, and may
 *   differ from the cwd. That is how the app's bridge reaches this CLI without touching
 *   the user's global `~/.gemini/config/mcp_config.json` (rule 11): the plugin lives in
 *   a disposable folder of ours (`antigravityToolsTurn.ts`).
 *
 * ## Permissions: what holds the isolation, stated exactly
 *
 * In headless mode every permissioned tool is AUTO-DENIED (measured: `command`,
 * `read_file` outside the workspace, `mcp` without a rule — the CLI prints « headless
 * mode cannot prompt for » and the step ends `ERROR`). What is permitted is EXACTLY the
 * `permissions.allow` of our settings.json, and it holds ONE rule: `mcp(openmasq/*)` —
 * the tools of a server named after the app's bridge (`TOOLS_SERVER_NAME`). The syntax
 * is the CLI's documented `mcp(server/tool)` (`docs/cli/permissions`), measured to let
 * the call through, and only that one. On the TEXT turn no server of that name exists,
 * so the rule grants nothing: writing it on every turn is what keeps two concurrent
 * turns from clobbering each other's settings.
 *
 * ⚠️ **NEVER pass `--dangerously-skip-permissions`.** That flag would hand the model the
 * user's machine — it is the only thing standing between the CLI's ~57 built-in tools
 * and the disk.
 *
 * ⚠️ **The CLI still ADVERTISES its ~57 built-in tools** at `init` (run_command,
 * write_to_file, browser_*, search_web…): `init.tools` is not an allow-list here, and
 * `toolGate.ts` is NOT applied to this stream — on this CLI the perimeter holds by
 * PERMISSION (the rule above), not by advertisement. Reads INSIDE the workspace are
 * free of permission (measured: the model reads the CLI's own tool-schema files) — so
 * the tooled turn's workspace is an empty disposable folder holding only the plugin.
 * The model may read the bridge's token there; it dies with the turn, and no tool that
 * could carry it out (`read_url`, `command`) is granted.
 *
 * ⚠️ **The user's GLOBAL MCP servers are still read** with `--app_data_dir` (measured:
 * a server in `~/.gemini/config/mcp_config.json` starts during our turn). Nothing
 * grants them — unless the user named one of their own `openmasq`. Their server, their
 * machine: an accepted residual, stated here rather than hidden.
 *
 * ## The model
 *
 * No `--model` is passed: the account's default is used. The CLI's ids are pinned to a
 * version (`gemini-3.7-flash-medium`, `gemini-3.1-pro-high`…) and rotate with the
 * offer — a catalogue entry naming one would rot into a CLI error. One entry, like codex.
 * (`agy models` lists the account's ids live — a dynamic list is a possible follow-up.)
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretAntigravityEvent } from "./antigravityStream";
import { streamCliProcess } from "./spawnStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";

/**
 * The isolated data dir, RELATIVE to `~/.gemini` (the CLI refuses an absolute path).
 * One stable name rather than one per turn: the dir holds nothing but our settings and
 * the CLI's own scratch, and creating/removing a directory in the user's home on every
 * message would be noise — the isolation comes from it not being THEIRS.
 */
export const ANTIGRAVITY_APP_DATA_DIR = ".openmasq-cli";

/**
 * The ONE permission rule of our data dir: the app's bridge, and nothing else (header).
 * Format `mcp(server/tool)` — the CLI's documented grammar, measured to match.
 */
export const ANTIGRAVITY_BRIDGE_RULE = `mcp(${TOOLS_SERVER_NAME}/*)`;

/**
 * What we write in that dir before a turn. ONE allow rule, the bridge's — every other
 * permissioned tool stays auto-denied by headless mode. Written on every turn (cheap,
 * idempotent) so a hand-edit can never leave a wider grant behind.
 */
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
