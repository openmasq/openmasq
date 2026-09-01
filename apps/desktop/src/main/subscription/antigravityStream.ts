/**
 * Interpreter for the `agy -p --output-format stream-json` stream (NDJSON) → engine
 * actions. Pure, tested.
 *
 * Vocabulary MEASURED on 31/08/2026 against CLI 1.1.21 (real captures):
 * - `{event:"init", conversation_id, init:{cwd, tools[], permission_mode}}` — the session.
 *   ⚠️ `init.tools` lists the CLI's ~50 BUILT-IN tools (run_command, write_to_file,
 *   browser_*…) whatever the flags: this CLI has no `--disable`. They are not usable
 *   for all that — see `antigravityEngine.ts`, headless auto-denies every permissioned
 *   tool — but nothing about them can be read as an allow-list.
 * - `{event:"step_update", step_update:{step_type:"agent_response", state, text_delta}}` —
 *   the TEXT, in real increments (unlike codex, which delivers one block). MEASURED:
 *   the `DONE` event carries the LAST increment, not a recap — concatenating every
 *   `text_delta` reproduces `result.response` exactly. So we never skip one.
 * - `{event:"step_update", step_update:{step_type:"tool", state:"ERROR", tool_info:{error}}}` —
 *   a tool the CLI refused itself (headless cannot prompt). Not our failure: the model
 *   usually says so in prose right after, so the stream stays silent about it.
 * - `{event:"result", result:{status, response, usage:{input_tokens, output_tokens,
 *   thinking_tokens, cache_read_tokens, total_tokens}}}` — the end of the turn.
 *
 * ⚠️ **A SUCCESS turn can carry an EMPTY response** (measured: the model tries
 * `run_command`, headless denies it, the CLI prints « no output produced » on stderr and
 * ends with `status:"SUCCESS"`, `response:""`). Returning that silently would show an
 * empty bubble — the one thing a chat must never do — so we turn it into an explained
 * error, and only when NO delta was seen (`sawDelta`).
 */
import type { TokenUsage } from "@openmasq/llm";
import type { CliAction } from "./spawnStream";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `usage` → `TokenUsage`. `input_tokens` follows OpenAI semantics (cache INCLUDED),
 *  `cache_read_tokens` being its share — the same reading as codex. `thinking_tokens`
 *  is a share of the output, not a third bucket: it is not re-added. */
export function antigravityUsage(usage: unknown): TokenUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const num = (k: string): number | undefined =>
    typeof usage[k] === "number" ? (usage[k] as number) : undefined;
  const inputTokens = num("input_tokens");
  const outputTokens = num("output_tokens");
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const cached = num("cache_read_tokens");
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(cached ? { cachedInputTokens: cached } : {}),
  };
}

/** The message shown when the turn ends with nothing to show. Names the CAUSE
 *  (a local tool this app refuses on purpose) and the way out — never « empty answer ». */
export const ANTIGRAVITY_EMPTY_TURN =
  "L'agent Antigravity a voulu utiliser un outil de votre machine (commande, fichier, " +
  "navigateur), que cette conversation refuse par construction, et n'a donc rien répondu. " +
  "Reformulez sans lui demander d'agir sur votre poste, ou choisissez un autre modèle.";

/** A failed turn, made readable. Never `[object Object]`, never silence. */
export function antigravityErrorMessage(result: Record<string, unknown>): string {
  const err = result["error"];
  const raw = isRecord(err) ? err["message"] : err;
  if (typeof raw === "string" && raw) return raw;
  const status = result["status"];
  return typeof status === "string" && status
    ? `La CLI Antigravity a terminé en « ${status} ».`
    : "La CLI Antigravity a terminé en erreur.";
}

export function interpretAntigravityEvent(event: unknown, sawDelta: boolean): CliAction | null {
  if (!isRecord(event)) return null;
  const kind = event["event"];

  if (kind === "init") {
    const id = event["conversation_id"];
    return typeof id === "string" ? { kind: "session", id } : null;
  }

  if (kind === "step_update") {
    const step = event["step_update"];
    if (!isRecord(step)) return null;
    if (step["step_type"] !== "agent_response") return null;
    const delta = step["text_delta"];
    return typeof delta === "string" && delta ? { kind: "text", delta } : null;
  }

  if (kind === "result") {
    const result = event["result"];
    if (!isRecord(result)) return null;
    if (result["status"] !== "SUCCESS") {
      return { kind: "error", message: antigravityErrorMessage(result) };
    }
    const response = result["response"];
    const empty = !sawDelta && (typeof response !== "string" || !response.trim());
    if (empty) return { kind: "error", message: ANTIGRAVITY_EMPTY_TURN };
    return { kind: "done", usage: antigravityUsage(result["usage"]), finish: "stop" };
  }

  return null;
}
