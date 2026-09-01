/**
 * The ANTIGRAVITY-specific part (`agy -p`) of the subscription engine — the user's
 * Google Antigravity subscription, served by THEIR OWN installed CLI. Loop:
 * `spawnStream.ts`; events: `antigravityStream.ts`. Everything below is MEASURED on
 * 31/08/2026 against CLI 1.1.21.
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
 *     applies — OURS is: an allow rule written in the isolated dir DID unlock
 *     `run_command`, so an isolated dir with no rule at all cannot be unlocked by
 *     anything the user configured for their own sessions;
 *   · the conversation, its history and its caches land THERE, not in the user's
 *     `~/.gemini/antigravity-cli/conversations` — an OpenMasq turn leaves no trace in
 *     their personal history;
 *   · **auth keeps working** (creds stay in the base `~/.gemini`) — the exact counterpart
 *     of codex's « auth still uses CODEX_HOME ».
 *
 * ⚠️ **NEVER pass `--dangerously-skip-permissions`.** In headless mode every permissioned
 * tool is AUTO-DENIED (measured: « permission check failed for command "id": user denied
 * permission ») — that auto-deny IS the isolation on this CLI, which has no `--disable`
 * to cut tools with. That flag would hand the model the user's machine.
 *
 * ⚠️ **The CLI still ADVERTISES its ~50 built-in tools** at `init` (run_command,
 * write_to_file, browser_*, search_web…). They are denied at use time, but nothing here
 * shrinks that list — so the `toolGate` invariant (« the turn's only tools are the app's
 * bridge ») cannot hold on this CLI. Hence: NO tooled turn (`desktop.ts`
 * `subscriptionToolsCli`), the app's connectors are not offered on this model.
 *
 * ⚠️ **The MCP bridge is IMPOSSIBLE here, measured.** MCP servers are read only from the
 * GLOBAL `~/.gemini/config/mcp_config.json`: `agy mcp add` run WITH `--app_data_dir`
 * still writes there, and a plugin dropped in the turn's own cwd
 * (`.agents/plugins/<n>/mcp_config.json`) is never loaded. Wiring the bridge would mean
 * writing the user's global config and leaving a loopback server exposed to all their
 * other Antigravity sessions — rule 11 forbids exactly that. Do not "fix" this by
 * writing to their config.
 *
 * ## The model
 *
 * No `--model` is passed: the account's default is used. The CLI's ids are pinned to a
 * version (`gemini-3.7-flash-medium`, `gemini-3.1-pro-high`…) and rotate with the
 * offer — a catalogue entry naming one would rot into a CLI error. One entry, like codex.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretAntigravityEvent } from "./antigravityStream";
import { streamCliProcess } from "./spawnStream";

/**
 * The isolated data dir, RELATIVE to `~/.gemini` (the CLI refuses an absolute path).
 * One stable name rather than one per turn: the dir holds nothing but our settings and
 * the CLI's own scratch, and creating/removing a directory in the user's home on every
 * message would be noise — the isolation comes from it not being THEIRS.
 */
export const ANTIGRAVITY_APP_DATA_DIR = ".openmasq-cli";

/**
 * What we write in that dir before a turn. Deliberately EMPTY of permissions: no allow
 * rule means headless denies every tool that asks for one. Written on every turn (cheap,
 * idempotent) so a hand-edit can never leave a grant behind.
 */
export const ANTIGRAVITY_SETTINGS = { permissions: { allow: [] as string[] } };

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

export function buildAntigravityArgs(opts: { prompt: string }): string[] {
  return [
    "--app_data_dir=" + ANTIGRAVITY_APP_DATA_DIR,
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--print-timeout",
    PRINT_TIMEOUT,
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
