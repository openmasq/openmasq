import type {
  ChatMessage,
  CompleteToolsResult,
  ProviderId,
  StreamDone,
  ToolDef,
} from "@openmasq/llm";

export type { TokenUsage, StreamDone } from "@openmasq/llm";

export interface StartChatPayload {
  requestId: string;
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface ChatHandlers {
  onChunk: (delta: string) => void;
  /** A delta of the model's REFLECTION (see `@openmasq/llm` `onReasoning`) — the
   *  live chain of thought a reasoning model emits before its answer. Optional: a
   *  host that doesn't forward it, or a model that doesn't reason, simply never
   *  calls it and the bubble keeps its loader. */
  onReasoning?: (delta: string) => void;
  /** Stream completion: token usage (when reported) + why it ended (`finish`), so a
   *  truncated (`length`/`cut`) reply can be flagged incomplete, not silently done. */
  onDone: (done?: StreamDone) => void;
  onError: (message: string) => void;
}

/** Handlers for a STREAMING agentic tool turn ({@link Host.streamChatTools}):
 *  assistant text streams via `onChunk`; `onDone` carries the assembled turn
 *  (text + tool calls + usage) once the model finishes this turn. */
export interface CompleteToolsHandlers {
  onChunk: (delta: string) => void;
  onDone: (result: CompleteToolsResult) => void;
  onError: (message: string) => void;
  /** Running char-count of the tool-call ARGUMENTS the model is streaming + the tool
   *  NAME (known early — it streams before the args). A large argument (a full write_file
   *  body) streams for seconds with no `onChunk` text, so this is the only live progress
   *  signal for it. Optional; absent on hosts/providers that don't stream tool turns.
   *  Surfaced in the desktop Debug Log timeline AND the chat "thinking" indicator. */
  onToolArgs?: (chars: number, name?: string) => void;
  /** A delta of the model's REFLECTION for this agentic turn — same channel and same
   *  optionality as {@link ChatHandlers.onReasoning}. */
  onReasoning?: (delta: string) => void;
}

/**
 * One-shot, non-streaming completion. Used by the optional model-based
 * redaction proxy to ask a small local model (Ollama / Mistral) which spans of
 * a message are sensitive, before the message is sent to the real provider.
 */
export interface CompletePayload {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface DetectLocalPayload {
  /** The text to scan for free-form PII (names/orgs/places). The offline BERT NER
   *  model is fixed (multilingual mBERT — bundled on desktop, downloaded on
   *  mobile/web), so there is no model choice to pass. */
  text: string;
}

/**
 * Non-streaming agentic completion with tool-calling. The store runs the loop:
 * call this, execute the returned tool calls (through {@link McpHost}, with
 * redaction), append the results, call again until no tools are requested.
 */
export interface CompleteToolsPayload {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  /** Correlates the request so `cancelTools(requestId)` can abort the in-flight
   *  model call mid tool-loop (the agentic turn isn't streamed, so Stop needs a
   *  side channel to interrupt it). */
  requestId?: string;
  /** Force a tool call this turn (`"required"`) — the auto-retry that boosts a
   *  weak model which declined without calling any tool. Default `"auto"`. */
  toolChoice?: "auto" | "required";
}
