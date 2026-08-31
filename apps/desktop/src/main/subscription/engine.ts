/**
 * The "subscription" engine: a chat turn served by the user's official CLI,
 * in headless mode, instead of an API key.
 *
 * Auth NEVER goes through us — the CLI reads its own keychain, and this process sees
 * no token, no cookie, no client credential. This is the property that this path rests
 * on: nothing is impersonated, we talk to a client installed and licensed by the user.
 * Do not "optimize" by reading the CLI's credentials to call the API
 * directly: that would be exactly the thing this module exists to avoid.
 *
 * ## The flags, and why those (measured on CLI 2.1.241)
 *
 * By default the CLI inherits ALL of the user's developer environment:
 * their CLAUDE.md, their MCP servers, their plugins, their hooks (one of them crashed
 * looking for `/dev/tty`, absent in headless mode). Unacceptable for an embedded chat
 * engine: behavior would depend on the machine, and the user's private
 * environment would leak into the product.
 *
 * Two flags are necessary and COMPLEMENTARY — each catches what the other misses:
 *   • `--safe-mode`         cuts CLAUDE.md / auto memory / hooks, BUT leaves plugins
 *   • `--setting-sources ""` cuts plugins, BUT lets auto memory come back
 * Measured: by default 14 MCP servers + 2 plugins + memory; both together ⇒ 0 / 0 / none.
 *
 * ⚠️ **Do not replace with `--bare`.** It cleans more, but its docs are explicit:
 * « Anthropic auth is strictly ANTHROPIC_API_KEY … OAuth and keychain are never read ».
 * So it disables the subscription, i.e. the module's very reason for existing. `--safe-mode`,
 * on the other hand, states « Auth … work normally » — and `apiKeySource: "none"` confirms it at runtime.
 *
 * ⚠️ `--output-format stream-json` REQUIRES `--verbose` (hard error otherwise).
 *
 * ## The tool perimeter is an ALLOW-LIST — `--tools ""`
 *
 * A chat turn needs NONE of the CLI's built-in tools: what the model may
 * call is the app's bridge and nothing else (tooled turn), so nothing at all here.
 * `--tools ""` says exactly that — measured on 2.1.247: `system/init` announces
 * `tools: []`, and the MCP bridge's tools survive the flag when there are any
 * (`claudeToolsTurn.ts`). It's an allow-list in the sense of rule 7: what isn't
 * named doesn't exist for the model.
 *
 * ⚠️ Neither `--allowedTools` nor `--disallowed-tools` can hold this role, measured:
 * the first doesn't filter the perimeter (it governs PERMISSION, not existence),
 * the second removes by NAME — so it can only cover what we thought to write, and
 * a name that changes empties it silently. `CHAT_DISALLOWED_TOOLS` stays in place as
 * belt-and-suspenders, never as the guard; the guard that HOLDS is `--tools ""`,
 * backed by the runtime net on `system/init` (`toolGate.ts`).
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretClaudeEvent } from "./claudeStream";
import { streamCliProcess, SubscriptionCliError } from "./spawnStream";

// The spawn/NDJSON/cancellation loop lives in `spawnStream.ts` (generic, a single one);
// this file keeps only the claude-SPECIFIC part: the measured flags and the routing.
export { SubscriptionCliError };

/**
 * The perimeter's BELT-AND-SUSPENDERS, not the guard: `--tools ""` (above) is what
 * decides, these names only restate "no" on capabilities a chat use should
 * never touch — writing to disk, executing, reaching out over the network.
 * ⚠️ NEVER treat this list as the protection: it removes by name, so it
 * only covers what we thought to write (rule 7). Adding a line to it doesn't replace
 * checking that `--tools ""` still holds.
 */
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
  /** OpenMasq's system prompt. Passed as `--system-prompt` (a field of its own on the
   *  CLI, like on the Messages API), never concatenated into the user prompt. */
  system?: string;
  /** The OpenMasq conversation id, reused as `--session-id` (must be a UUID). */
  sessionId: string;
  /** FAMILY alias passed as `--model` (`sonnet`/`opus`/`haiku` — the CLI resolves it to the
   *  subscription's current model). Absent ⇒ no flag: the CLI's default.
   *  Measured (25/08): `--model haiku` coexists with the isolation flags. */
  model?: string;
  /** Resume the existing session rather than opening a new one (2nd message onward). */
  resume?: boolean;
  /**
   * DEDICATED and neutral working directory. Never one of the user's project
   * folders: the CLI would look there for settings and context files.
   */
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

/**
 * A claude turn. Same contract as `streamAnthropic` in `@openmasq/llm` (deltas then
 * `StreamDone`) — the generic loop is `spawnStream.ts`, this wrapper only contributes
 * the measured args and the claude interpreter.
 */
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
