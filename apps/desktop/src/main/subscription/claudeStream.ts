/**
 * Le flux `claude -p --output-format stream-json --verbose --include-partial-messages`,
 * traduit en actions pour l'UI. Formes RELEVÉES sur la CLI 2.1.241, pas supposées.
 *
 * C'est du NDJSON dont les events intéressants encapsulent le SSE Anthropic :
 *
 *   {"type":"stream_event","event":{"type":"content_block_delta",
 *    "delta":{"type":"text_delta","text":"La"}}, "session_id":"…"}
 *
 * ⚠️ **Le piège du doublon.** À la fin d'un tour, la CLI émet AUSSI un event
 * `{"type":"assistant","message":{…content:[{type:"text",text:"<toute la réponse>"}]}}`
 * qui REPRODUIT intégralement ce que les `content_block_delta` viennent de streamer.
 * Un parser qui lit les deux affiche la réponse en double. On ne lit donc le texte que
 * des deltas, et `assistant` sert uniquement de FILET quand les partiels sont absents
 * (`--include-partial-messages` non passé, ou une version qui ne les émet pas) — d'où
 * le drapeau `sawDelta` porté par le lecteur.
 */
import type { StreamFinish, TokenUsage } from "@openmasq/llm";
import { cliToolGateMessage, unexpectedCliTools } from "./toolGate";

/** Ce que le moteur fait remonter. Tout le reste du flux est ignoré volontairement. */
export type ClaudeAction =
  | { kind: "session"; id: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "rateLimit"; status: string; resetsAt?: number; windowType?: string }
  | { kind: "done"; usage?: TokenUsage; finish: StreamFinish }
  | { kind: "error"; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * `input_tokens` d'Anthropic EXCLUT le cache; le contrat de `TokenUsage` veut
 * `inputTokens` = prompt COMPLET, cache inclus (voir le commentaire dans
 * `@openmasq/llm` types.ts). On ré-additionne ici, comme les autres adaptateurs —
 * sans quoi un cache qui marche se lirait comme une baisse de consommation.
 */
export function normalizeUsage(raw: unknown): TokenUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const num = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : 0);
  const cacheRead = num("cache_read_input_tokens");
  const cacheWrite = num("cache_creation_input_tokens");
  const usage: TokenUsage = {
    inputTokens: num("input_tokens") + cacheRead + cacheWrite,
    outputTokens: num("output_tokens"),
  };
  if (cacheRead) usage.cachedInputTokens = cacheRead;
  if (cacheWrite) usage.cacheWriteInputTokens = cacheWrite;
  return usage;
}

/** `stop_reason` Anthropic → le vocabulaire `StreamFinish` de `@openmasq/llm`. */
export function toFinish(stopReason: unknown): StreamFinish {
  if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
  if (stopReason === "max_tokens") return "length";
  return "other";
}

/**
 * Un event NDJSON déjà parsé → l'action à jouer, ou `null` si l'event ne concerne pas
 * l'UI (`system/init`, `system/status`, `message_start`, `content_block_stop`…).
 *
 * `sawDelta` : le lecteur a-t-il DÉJÀ reçu au moins un `content_block_delta` ? S'il en
 * a reçu, l'event `assistant` final est un doublon et on le jette.
 */
export function interpretClaudeEvent(event: unknown, sawDelta: boolean): ClaudeAction | null {
  if (!isRecord(event)) return null;
  const type = event.type;

  if (type === "stream_event" && isRecord(event.event)) {
    const inner = event.event;
    if (inner.type === "content_block_delta" && isRecord(inner.delta)) {
      const d = inner.delta;
      if (d.type === "text_delta" && typeof d.text === "string") {
        return { kind: "text", delta: d.text };
      }
      if (d.type === "thinking_delta" && typeof d.thinking === "string") {
        return { kind: "reasoning", delta: d.thinking };
      }
      return null;
    }
    return null;
  }

  // Filet: le tour complet, utile SEULEMENT si aucun delta n'est passé.
  if (type === "assistant" && !sawDelta && isRecord(event.message)) {
    const content = event.message.content;
    if (!Array.isArray(content)) return null;
    const text = content
      .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === "text")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .join("");
    return text ? { kind: "text", delta: text } : null;
  }

  // Le quota d'ABONNEMENT (fenêtre 5 h / hebdo), pas une limite d'API. C'est le signal
  // à montrer tel quel : « ton abonnement est épuisé jusqu'à <resetsAt> », pas « erreur ».
  if (type === "rate_limit_event" && isRecord(event.rate_limit_info)) {
    const info = event.rate_limit_info;
    return {
      kind: "rateLimit",
      status: typeof info.status === "string" ? info.status : "unknown",
      resetsAt: typeof info.resetsAt === "number" ? info.resetsAt : undefined,
      windowType: typeof info.rateLimitType === "string" ? info.rateLimitType : undefined,
    };
  }

  // `system/init` ANNONCE le périmètre d'outils du tour, AVANT le premier appel — la
  // seule fenêtre où un outil que l'app n'a pas offert peut être REFUSÉ plutôt que subi.
  // Un intrus rend une ERREUR : `spawnStream` la remonte et tue la CLI, donc le tour
  // échoue au lieu de courir avec une capacité de plus (règle 7, voir `toolGate.ts`).
  if (type === "system" && event.subtype === "init") {
    const unexpected = unexpectedCliTools(event.tools);
    if (unexpected.length) return { kind: "error", message: cliToolGateMessage(unexpected) };
    if (typeof event.session_id === "string") return { kind: "session", id: event.session_id };
    return null;
  }

  if (type === "result") {
    if (event.is_error === true) {
      const msg = typeof event.result === "string" ? event.result : "La CLI a répondu une erreur.";
      return { kind: "error", message: msg };
    }
    return {
      kind: "done",
      usage: normalizeUsage(event.usage),
      finish: toFinish(event.stop_reason),
    };
  }

  return null;
}

/**
 * Découpe un flux d'octets en lignes NDJSON complètes. `spawn` livre des CHUNKS, pas
 * des lignes : un event de plusieurs Ko (l'`init`, un `message_start`) arrive coupé en
 * deux, et un `JSON.parse` par chunk le perdrait silencieusement.
 */
export class NdjsonLineBuffer {
  private buffer = "";

  /** Les lignes complètes contenues dans ce chunk; le reliquat est gardé. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    return parts.map((l) => l.trim()).filter(Boolean);
  }

  /** Le reliquat final (une dernière ligne sans `\n`), à traiter à la fermeture. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
