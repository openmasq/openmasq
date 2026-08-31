/**
 * The CODEX-specific part (`codex exec`) of the subscription engine — the user's
 * ChatGPT subscription, served by THEIR OWN official CLI. Loop: `spawnStream.ts`;
 * events: `codexStream.ts`. Everything below is MEASURED on 26/08/2026 against CLI 0.149.1.
 *
 * ## The flags, and why those
 *
 * Of the three CLIs wired in, Codex is the one that best tools isolation — each
 * flag below has been verified at runtime:
 *
 * - `--json`: JSONL on stdout (the stream `codexStream.ts` reads).
 * - `--ephemeral`: NO session file written to disk. An OpenMasq conversation
 *   must not leave a trace in the CLI's personal history.
 * - `--ignore-user-config`: the user's `config.toml` is NOT loaded — so
 *   neither their model, MCP servers, nor settings. ⚠️ Its docs state « auth still
 *   uses CODEX_HOME »: the subscription keeps working, exactly the
 *   counterpart of claude's `--safe-mode` (isolation WITHOUT breaking auth).
 * - `--ignore-rules`: no user or project `.rules` (execpolicy).
 * - `--skip-git-repo-check`: the dedicated cwd is not a git repo, and doesn't need to be.
 * - `-s read-only`: read-only sandbox. MEASURED: a file-creation request
 *   is refused, nothing is written to the cwd.
 * - `--disable shell_tool`: **the flag that matters**. Without it, `-s read-only` still
 *   lets the model EXECUTE commands (measured: `/bin/zsh -lc ls`, a LOGIN
 *   shell that sources the user's rc files) — so it can read any readable
 *   file and bring it back into context. With it, the CLI answers « I don't have access
 *   to a terminal command » and no `command_execution` appears in the stream.
 *   `browser_use`/`computer_use` are cut the same way, as a precaution.
 *
 * ⚠️ **`codex exec` READS STDIN even when the prompt is passed as an argument** (« Reading
 * additional input from stdin… »): without `stdio[0] = "ignore"`, the process waits
 * forever — the turn never returns. It's this CLI's trap #1; the generic
 * loop ignores stdin by construction — don't "fix" this detail.
 *
 * ⚠️ **`web_search` stays active** and CANNOT be disabled (`tools.web_search=false`
 * measured to have no effect, no matching feature). It runs SERVER-SIDE: it only
 * carries the turn's REDACTED text, to the same recipient as the prompt — not
 * a new egress class (rule 11), but worth knowing.
 *
 * ⚠️ **No deltas**: the text arrives as a COMPLETE `agent_message` (measured: 16 s of
 * silence then 2,213 characters). The reply therefore appears as one block, like an
 * unstreamed turn — that's this CLI's limitation, not a wiring defect.
 *
 * ## The model
 *
 * With a ChatGPT account, the CLI accepts ONLY the account's default model: an
 * explicit `-m gpt-5.3-codex` measured returns a 400 « model is not supported when using Codex with
 * a ChatGPT account ». So no `-m` is ever passed — a single catalog entry.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretCodexEvent } from "./codexStream";
import { streamCliProcess } from "./spawnStream";

/** The capabilities cut for chat use (`--disable` features), ONE list for the
 *  text turn as for the tooled turn (rule 9). Three families:
 *  execute (`shell_tool`, `unified_exec` — 0.149's other execution path),
 *  drive the machine (`browser_use*`, `computer_use`), and **grant itself more access**
 *  (`apps`, `plugins`, `plugin_sharing`, `remote_plugin`, `tool_suggest`,
 *  `skill_mcp_dependency_install`). This last family is the one 0.149.1
 *  reaches for spontaneously: measured, when asked about its Dropbox the model tries to INSTALL
 *  a codex connector instead of calling the turn's tool — an access that would escape the
 *  app's vault (rule 11) and its write gate. So it fails before it can exist.
 *  ⚠️ DO NOT add `code_mode_host` to it: measured, the CLI's tool router goes
 *  through it and cutting it makes EVERY MCP tool call fail (« code-mode host is
 *  disabled »), including the bridge's own. */
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

/** `codex exec` has NO system field: it is prefixed to the prompt, clearly separated.
 *  One single home, so the text turn and the tooled turn say the same thing. */
export function codexPrompt(system: string | undefined, prompt: string): string {
  return system ? `Instructions système :\n${system}\n\n---\n\n${prompt}` : prompt;
}

export interface CodexTurnOptions {
  /** Absolute path resolved by `resolveCli`. */
  binPath: string;
  /** The flattened turn — system prompt ALREADY prefixed by `codexPrompt` (no dedicated field). */
  prompt: string;
  /** DEDICATED and neutral working directory — never one of the user's folders. */
  cwd: string;
  signal?: AbortSignal;
}

export function buildCodexArgs(opts: {
  prompt: string;
  /** The TOOLED turn's `-c mcp_servers.…` override (`codexToolsTurn.ts`). Absent for the
   *  text turn: without it, and with `--ignore-user-config`, the CLI has NO MCP server at all. */
  mcpServerConfig?: string;
}): string[] {
  return [
    "exec",
    opts.prompt,
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
    binPath: opts.binPath,
    args: buildCodexArgs(opts),
    cwd: opts.cwd,
    interpret: interpretCodexEvent,
    signal: opts.signal,
  });
}
