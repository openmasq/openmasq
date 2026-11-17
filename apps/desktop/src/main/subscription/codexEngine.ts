/**
 * The CODEX-specific part (`codex exec`) of the subscription engine: the user's own
 * official CLI. Loop: `spawnStream.ts`; events: `codexStream.ts`.
 *
 * ## The flags
 * - `--json`: JSONL on stdout. `--ephemeral`: NO session file on disk.
 * - `--ignore-user-config`: the user's config (model, MCP servers) is NOT loaded, and auth
 *   still works: the counterpart of claude's `--safe-mode`. `--ignore-rules`,
 *   `--skip-git-repo-check`: the dedicated cwd is neutral.
 * - `-s read-only`: nothing is written to the cwd.
 * - `--disable shell_tool`: THE flag that matters. Without it `read-only` still EXECUTES
 *   commands through a LOGIN shell, so it can read any readable file into context.
 *
 * ⚠️ `codex exec` READS STDIN to its end: an open, never-closed stdin and the turn never
 * returns. The prompt therefore rides on it as `-` (« read from stdin », its own `--help`,
 * measured 0.149.1), written whole then CLOSED by `spawnStream.ts` — never in argv, which
 * the OS caps (`spawnFailure.ts`). Never pass the prompt AND pipe stdin: codex would append
 * stdin as a `<stdin>` block.
 * ⚠️ `web_search` CANNOT be disabled. It runs SERVER-SIDE on the REDACTED text, to the same
 * recipient as the prompt: not a new egress class (rule 11).
 * ⚠️ No deltas: the text arrives as one COMPLETE message. The CLI's limitation.
 *
 * No `-m`: with a ChatGPT account the CLI accepts ONLY the account's default model.
 */
import type { StreamDone } from "@openmasq/llm";
import { promptWithSystem } from "./bridge";
import { interpretCodexEvent } from "./codexStream";
import { streamCliProcess } from "./spawnStream";

/** The capabilities cut (`--disable`), ONE list for the text and tooled turns (rule 9).
 *  Three families: execute, drive the machine, and GRANT ITSELF MORE ACCESS (installing a
 *  connector would escape the app's vault and write gate, rule 11).
 *  ⚠️ NEVER add `code_mode_host`: the CLI's tool router goes through it, and cutting it
 *  fails EVERY MCP tool call, the bridge's included. */
export const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "apps",
  "plugins",
  "plugin_sharing",
  "remote_plugin",
  "tool_suggest",
  "skill_mcp_dependency_install",
] as const;

/** `codex exec` has NO system field: it is prefixed to the prompt (`bridge.ts`). */
export const codexPrompt = promptWithSystem;

export interface CodexTurnOptions {
  /** Absolute path resolved by `resolveCli`. */
  binPath: string;
  /** The flattened turn — system prompt ALREADY prefixed by `codexPrompt` (no dedicated field). */
  prompt: string;
  /** DEDICATED and neutral working directory — never one of the user's folders. */
  cwd: string;
  signal?: AbortSignal;
}

/** No prompt here: `-` = read it from stdin (see the header). */
export function buildCodexArgs(opts: {
  /** The TOOLED turn's `-c mcp_servers.…` override; absent ⇒ NO MCP server at all. */
  mcpServerConfig?: string;
}): string[] {
  return [
    "exec",
    "-",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    ...CODEX_DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    ...(opts.mcpServerConfig ? ["-c", opts.mcpServerConfig] : []),
  ];
}

/** A codex turn — same contract as `streamClaudeSubscription`. */
export async function* streamCodexSubscription(
  opts: CodexTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    cli: "codex",
    binPath: opts.binPath,
    args: buildCodexArgs({}),
    stdin: opts.prompt,
    cwd: opts.cwd,
    interpret: interpretCodexEvent,
    signal: opts.signal,
  });
}
