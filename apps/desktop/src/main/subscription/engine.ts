/**
 * The "subscription" engine: a chat turn served by the user's official CLI, headless,
 * instead of an API key. Auth NEVER goes through us: the CLI reads its own keychain and
 * this process sees no token. Never "optimize" by reading the CLI's credentials to call
 * the API directly.
 *
 * ## The flags
 * By default the CLI inherits ALL of the user's developer environment (CLAUDE.md, MCP
 * servers, plugins, hooks). Two COMPLEMENTARY flags isolate it: `--safe-mode` (cuts
 * CLAUDE.md / memory / hooks, leaves plugins) and `--setting-sources ""` (cuts plugins,
 * lets memory back). ⚠️ Never `--bare`: it never reads OAuth, so it disables the
 * subscription. `stream-json` REQUIRES `--verbose`.
 *
 * ## The tool perimeter is an ALLOW-LIST: `--tools ""`
 * A chat turn needs NONE of the built-in tools; the bridge's MCP tools survive the flag
 * (`claudeToolsTurn.ts`). ⚠️ Neither `--allowedTools` (governs PERMISSION, not existence)
 * nor `--disallowed-tools` (removes by NAME) can hold this role. `CHAT_DISALLOWED_TOOLS`
 * is belt-and-suspenders; the guard that HOLDS is `--tools ""`, backed by `toolGate.ts`.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretClaudeEvent } from "./claudeStream";
import { streamCliProcess, SubscriptionCliError } from "./spawnStream";

// The generic spawn/NDJSON loop is `spawnStream.ts`; this file keeps the claude-SPECIFIC part.
export { SubscriptionCliError };

/** BELT-AND-SUSPENDERS, not the guard: `--tools ""` decides. This list removes by name,
 *  so it only covers what we thought to write (rule 7). */
export const CHAT_DISALLOWED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "Task",
  "WebFetch",
  "WebSearch",
  "Read",
  "Glob",
  "Grep",
  "Skill",
  "Workflow",
  "ToolSearch",
  "SendMessage",
] as const;

export interface ClaudeTurnOptions {
  /** Absolute path resolved by `resolveCli`. */
  binPath: string;
  prompt: string;
  /** Passed as `--system-prompt`, never concatenated into the user prompt. */
  system?: string;
  /** The OpenMasq conversation id, reused as `--session-id` (must be a UUID). */
  sessionId: string;
  /** FAMILY alias passed as `--model` (the CLI resolves it). Absent ⇒ the CLI's default. */
  model?: string;
  /** Resume the existing session rather than opening a new one (2nd message onward). */
  resume?: boolean;
  /** DEDICATED and neutral cwd: the CLI reads settings and context files from it. */
  cwd: string;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
  /** SUBSCRIPTION quota reached (5h / weekly window) — to display as-is. */
  onRateLimit?: (info: { status: string; resetsAt?: number; windowType?: string }) => void;
}

export function buildClaudeArgs(opts: ClaudeTurnOptions): string[] {
  return [
    "-p",
    opts.prompt,
    ...(opts.system ? ["--system-prompt", opts.system] : []),
    ...(opts.model ? ["--model", opts.model] : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--safe-mode",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    // The perimeter's ALLOW-LIST: no built-in tool for a text turn (see the header).
    "--tools",
    "",
    "--disallowed-tools",
    ...CHAT_DISALLOWED_TOOLS,
    ...(opts.resume ? ["--resume", opts.sessionId] : ["--session-id", opts.sessionId]),
  ];
}

/** A claude turn: same contract as `streamAnthropic` in `@openmasq/llm`. */
export async function* streamClaudeSubscription(
  opts: ClaudeTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    binPath: opts.binPath,
    args: buildClaudeArgs(opts),
    cwd: opts.cwd,
    interpret: interpretClaudeEvent,
    signal: opts.signal,
    onReasoning: opts.onReasoning,
    onRateLimit: opts.onRateLimit,
  });
}
