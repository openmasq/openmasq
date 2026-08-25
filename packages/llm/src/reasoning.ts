// The REFLECTION channel, both halves: what a provider sends back (the delta readers
// below) and what it must be ASKED for (the request fields at the bottom).
//
// Three provider families, three behaviours — and only the first needs no asking:
//   • OpenAI-COMPATIBLE (DeepSeek, Qwen, Nemotron, GLM, MiniMax, Kimi, local R1…) —
//     streams its chain of thought unprompted in `reasoning_content`/`reasoning`.
//   • ASK-first (Anthropic `thinking`, Gemini `thinkingConfig`, OpenRouter `reasoning`) —
//     silent unless the request opts in, which is why `onReasoning`'s presence is the
//     switch (see `CompleteToolsOptions.onReasoning`).
//   • Never (GPT-5.x/o-series on `/chat/completions`, and every non-reasoning model) —
//     nothing to show, and nothing is invented in its place.
//
// Reasoning-model deltas on the OpenAI-COMPATIBLE wire.
//
// A reasoning model (DeepSeek-R1, Nemotron, many OpenRouter models…)
// streams its chain of thought in a SEPARATE delta field — `reasoning_content` (DeepSeek
// convention) or `reasoning` (OpenRouter) — NOT in `content`. If the parser reads only
// `content` and the model emits its whole turn as reasoning with an EMPTY `content` (it
// happens on free/reasoning models), the turn reads as a silent "no response" even though
// tokens WERE produced. These helpers read that field and provide a fallback.

import { supportsAdaptiveThinking, supportsGeminiThoughts } from "./models/capabilities.js";

/** The reasoning text on an OpenAI-compatible streaming delta, if any.
 *
 *  Three shapes, in precedence order: `reasoning_content` (DeepSeek), `reasoning`
 *  (OpenRouter's normalised string), then OpenRouter's **`reasoning_details`** — typed
 *  blocks (`reasoning.summary` → `summary`, `reasoning.text` → `text`) that carry the
 *  reflection of the OpenAI o-series/GPT-5.x models, whose `reasoning` field stays
 *  null/empty. Without that third read the whole think phase showed NOTHING live and
 *  the turn read as « pas streamé » (journal 02/08). An encrypted block (`data`) has
 *  no displayable text and is skipped. String fields win so one text never counts twice. */
export function deltaReasoning(delta: unknown): string | undefined {
  const d = delta as
    | { reasoning_content?: unknown; reasoning?: unknown; reasoning_details?: unknown }
    | undefined;
  const r = d?.reasoning_content ?? d?.reasoning;
  if (typeof r === "string" && r.length > 0) return r;
  if (Array.isArray(d?.reasoning_details)) {
    const parts: string[] = [];
    for (const b of d.reasoning_details as { summary?: unknown; text?: unknown }[]) {
      if (typeof b?.summary === "string" && b.summary) parts.push(b.summary);
      else if (typeof b?.text === "string" && b.text) parts.push(b.text);
    }
    if (parts.length) return parts.join("");
  }
  return undefined;
}

/** Clean accumulated reasoning to stand in as the answer ONLY when the model produced no
 *  `content` at all — otherwise a reasoning-only turn is an empty void. Strips `<think>`
 *  markers a model may wrap it in; returns "" if nothing usable remains. */
export function reasoningFallback(reasoning: string): string {
  return reasoning.replace(/<\/?think>/gi, "").trim();
}

/** Extra OpenAI-compatible request fields that ASK for the reflection. Only OpenRouter
 *  needs one: it normalises every upstream vendor's reasoning onto `delta.reasoning` but
 *  withholds it unless asked. Deliberately NOT sent to the other OpenAI-compatible
 *  endpoints — DeepSeek & co. already stream it, and a local/Scaleway/Zen endpoint may
 *  400 on an unknown field. `{}` when nobody is listening (identical bytes to before). */
export function openAiReasoningFields(
  provider: string,
  wants: boolean,
): Record<string, unknown> {
  return wants && provider === "openrouter" ? { reasoning: { enabled: true } } : {};
}

/**
 * The Anthropic `thinking` request field, plus the `max_tokens` floor it needs.
 *
 * Two traps it exists to hold:
 *   • **`display` is NOT optional.** The default is `"omitted"`, which still streams
 *     `thinking` blocks but with EMPTY text — i.e. exactly the long silent pause we are
 *     trying to remove. Only `"summarized"` carries readable text (the raw chain of
 *     thought is never returned by these models).
 *   • **`max_tokens` caps thinking AND the answer together**, so the 4096 that sized a
 *     no-thinking turn would now truncate the reply mid-sentence. Raised only when
 *     thinking is actually on — an unasked turn keeps its previous ceiling exactly.
 *
 * `withTools` is the third, and it is a **fail-closed** gate rather than a nicety:
 * with thinking on, a turn that calls a tool must have its thinking blocks (and their
 * signatures) echoed back VERBATIM on the next request or the API 400s — and our
 * agentic history is rebuilt from `{content, toolCalls}`, which has nowhere to carry
 * them. A forced `tool_choice: {type:"any"}` is refused outright alongside thinking on
 * top of that. So the tool-calling turn keeps its previous request exactly, and Claude's
 * reflection shows on the plain path only. Carrying the blocks through the loop (a
 * `ChatMessage` field + replay in `toAnthropicMessages`) is the tracked follow-up.
 */
export function anthropicThinkingFields(
  model: string,
  wants: boolean,
  withTools = false,
): { fields: Record<string, unknown>; maxTokens: number } {
  const on = wants && !withTools && supportsAdaptiveThinking(model);
  return {
    fields: on ? { thinking: { type: "adaptive", display: "summarized" } } : {},
    maxTokens: on ? THINKING_MAX_TOKENS : DEFAULT_MAX_TOKENS,
  };
}

/** Anthropic requires an explicit output cap; 4096 is our long-standing default. */
const DEFAULT_MAX_TOKENS = 4096;
/** …and the room a thinking turn needs on top of it (thinking + answer share the cap). */
const THINKING_MAX_TOKENS = 16000;

/** Gemini's `generationConfig.thinkingConfig` — thought SUMMARIES, on the models that
 *  have a thinking stage at all (2.5+). Older ids reject the field, so they get `{}`. */
export function geminiThinkingFields(model: string, wants: boolean): Record<string, unknown> {
  return wants && supportsGeminiThoughts(model) ? { thinkingConfig: { includeThoughts: true } } : {};
}
