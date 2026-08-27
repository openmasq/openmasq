/**
 * Interpréteur du flux `codex exec --json` (JSONL) → actions du moteur. Pur, testé.
 *
 * Vocabulaire MESURÉ le 26/08/2026 sur la CLI 0.149.1 (captures réelles) :
 * - `{type:"thread.started", thread_id}` — la session.
 * - `{type:"turn.started"}` — ignoré.
 * - `{type:"item.started"|"item.completed", item:{type, …}}` où `item.type` vaut
 *   `agent_message` (le TEXTE, champ `text`), `command_execution`, `web_search`,
 *   `reasoning`… Le texte arrive sur `item.completed` uniquement : la 0.149.1 n'émet
 *   AUCUN delta (mesuré : 16 s de silence puis 2 213 caractères d'un coup), donc pas
 *   de doublon possible — mais pas de streaming token par token non plus.
 * - `{type:"turn.completed", usage:{input_tokens, cached_input_tokens,
 *   cache_write_input_tokens, output_tokens, reasoning_output_tokens}}` — sémantique
 *   OpenAI : `input_tokens` INCLUT déjà le cache (pas de ré-addition, contrairement à
 *   Anthropic), `cached_input_tokens` en est la part.
 * - `{type:"turn.failed", error:{message}}` — l'échec du tour (modèle refusé, quota…).
 *   Le message imbrique souvent le JSON brut de l'API : on en extrait le texte utile.
 *
 * ⚠️ `agent_message` peut arriver PLUSIEURS fois dans un tour (le modèle annonce puis
 * conclut) — chacun est un morceau de la réponse, concaténé dans l'ordre d'arrivée.
 */
import type { TokenUsage } from "@openmasq/llm";
import type { CliAction } from "./spawnStream";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function codexUsage(usage: unknown): TokenUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const num = (k: string): number | undefined =>
    typeof usage[k] === "number" ? (usage[k] as number) : undefined;
  const inputTokens = num("input_tokens");
  const outputTokens = num("output_tokens");
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const cached = num("cached_input_tokens");
  const written = num("cache_write_input_tokens");
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(cached ? { cachedInputTokens: cached } : {}),
    ...(written ? { cacheWriteInputTokens: written } : {}),
  };
}

/**
 * Le message d'échec, lisible. La CLI enveloppe souvent la réponse d'API brute dans
 * une chaîne JSON (`{"type":"error","status":400,"error":{"message":"…"}}`) — on rend
 * le message INTÉRIEUR quand il existe, la chaîne telle quelle sinon. Jamais un
 * `[object Object]`, jamais un silence.
 */
export function codexErrorMessage(error: unknown): string {
  const raw = isRecord(error) ? error["message"] : error;
  if (typeof raw !== "string" || !raw) return "La CLI Codex a terminé en erreur.";
  try {
    const inner = JSON.parse(raw) as unknown;
    if (isRecord(inner) && isRecord(inner["error"])) {
      const m = inner["error"]["message"];
      if (typeof m === "string" && m) return m;
    }
  } catch {
    /* pas du JSON : la chaîne est déjà le message */
  }
  return raw;
}

export function interpretCodexEvent(event: unknown): CliAction | null {
  if (!isRecord(event)) return null;

  switch (event["type"]) {
    case "thread.started": {
      const id = event["thread_id"];
      return typeof id === "string" && id ? { kind: "session", id } : null;
    }
    case "item.completed": {
      const item = event["item"];
      if (!isRecord(item) || item["type"] !== "agent_message") return null;
      const text = item["text"];
      return typeof text === "string" && text ? { kind: "text", delta: text } : null;
    }
    case "turn.completed":
      return { kind: "done", usage: codexUsage(event["usage"]), finish: "stop" };
    case "turn.failed":
      return { kind: "error", message: codexErrorMessage(event["error"]) };
    default:
      // turn.started, item.started, command_execution/web_search/reasoning : ignorés.
      return null;
  }
}
