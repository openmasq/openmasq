/**
 * The Anthropic agentic-turn REQUEST, shared by the non-streaming
 * (`tools/anthropic.ts`) and streaming (`tools/anthropicStream.ts`) paths.
 *
 * One body builder on purpose: the two paths differ ONLY by `stream: true`, and the
 * prompt-cache breakpoints below are what make turns 2+ cheap — a second copy would
 * drift and silently lose the cache on one of the two paths (root rule 9).
 */
import { anthropicToolSchema } from "./anthropicSchema.js";
import { anthropicThinkingFields } from "../reasoning.js";
import type { ChatMessage, CompleteToolsOptions, CompleteToolsResult } from "../types.js";

export { anthropicUsage } from "../wire/index.js";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

// Anthropic REJECTS a text content block that is empty OR whitespace-only ("text content
// blocks must be non-empty", 400). A model routinely streams a lone "\n"/space around a
// tool call (see @openmasq/ui store), so an assistant turn's content is often whitespace —
// which the old truthy `if (m.content)` let through and 400'd the NEXT agentic turn once
// that turn was replayed in history. Only emit a text block when there's real text.
function textBlock(s: string | undefined): Block[] {
  return s && s.trim() ? [{ type: "text", text: s }] : [];
}

/**
 * Translate our agentic messages into Anthropic Messages shape. Tool results
 * (`role: "tool"`) become `tool_result` blocks inside a user turn; consecutive
 * ones are merged into a single user turn so user/assistant stay alternating.
 */
export function toAnthropicMessages(messages: ChatMessage[]): {
  role: "user" | "assistant";
  content: Block[];
}[] {
  const out: { role: "user" | "assistant"; content: Block[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const block: Block = {
        type: "tool_result",
        tool_use_id: m.toolCallId ?? "",
        // A tool_result's content is ALSO rejected when empty — a real MCP tool can
        // legitimately return nothing (an empty search), so substitute a placeholder.
        content: m.content && m.content.trim() ? m.content : "(résultat vide)",
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && last.content[0]?.type === "tool_result") {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: Block[] = [...textBlock(m.content)];
      for (const c of m.toolCalls)
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      out.push({ role: "assistant", content });
      continue;
    }
    // A user turn may carry image attachments (a redacted document sent as page
    // images). Expand them into text + image blocks exactly like the plain-stream path
    // (providers/anthropic.ts) — without this the agentic/tools path silently dropped the
    // images, so a document sent to a model WITH an MCP connector never reached it.
    if (m.attachments?.length) {
      const content: Block[] = [...textBlock(m.content)];
      for (const a of m.attachments)
        content.push({
          type: "image",
          source: { type: "base64", media_type: a.mediaType, data: a.dataBase64 },
        });
      out.push({ role: m.role, content });
      continue;
    }
    // Plain text turn. An empty/whitespace content can't be a valid block AND the content
    // array can't be empty, so a degenerate empty turn gets a minimal placeholder rather
    // than a 400 (a user/assistant turn is normally non-empty; this is a last resort).
    const blocks = textBlock(m.content);
    out.push({ role: m.role, content: blocks.length ? blocks : [{ type: "text", text: "…" }] });
  }
  return out;
}

export const STOP: Record<string, CompleteToolsResult["stopReason"]> = {
  tool_use: "tool_calls",
  end_turn: "stop",
  max_tokens: "length",
};

/** The Anthropic system prompt: our `role:"system"` messages, joined. */
export function anthropicSystem(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

/**
 * The Messages request body for an agentic turn.
 *
 * PROMPT CACHING: the agentic loop re-sends the SAME system prompt + tool schemas every
 * turn (only the growing message tail changes). Marking the end of that stable prefix
 * with `cache_control: ephemeral` lets Anthropic reuse the cached prefix on turns 2+ —
 * big TTFT + cost win (cache read ≈ 0.1× input). Breakpoints (≤4): the last tool caches
 * the whole tools array; system caches tools+system (cache order is tools → system →
 * messages). GA on anthropic-version 2023-06-01 (no beta header needed). Whether it
 * actually HITS is now measurable — see `anthropicUsage`.
 */
export function anthropicToolsBody(opts: CompleteToolsOptions, stream: boolean): string {
  const system = anthropicSystem(opts.messages);
  // Thinking is asked for only when a caller listens AND no tool rides this turn: a
  // thinking turn that calls a tool must echo its thinking blocks back verbatim next
  // request (400 otherwise) and this history has nowhere to keep them. See
  // `anthropicThinkingFields` — a tools turn therefore keeps its previous body exactly.
  const thinking = anthropicThinkingFields(opts.model, !!opts.onReasoning, !!opts.tools?.length);
  return JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens ?? thinking.maxTokens,
    ...(stream ? { stream: true } : {}),
    ...thinking.fields,
    // `temperature` is intentionally NOT sent: the current Claude models
    // (opus-4-8 / sonnet-4-6 / haiku-4-5) DEPRECATED it and return 400 if it's
    // present — even the redaction path's temperature:0. Anthropic's default is used.
    ...(system
      ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] }
      : {}),
    messages: toAnthropicMessages(opts.messages),
    ...(opts.tools?.length
      ? {
          tools: opts.tools.map((t, i, arr) => ({
            name: t.name,
            description: t.description,
            // A tool schema is authored by a THIRD PARTY (an MCP server), and the whole
            // tools array rides EVERY request — so one schema Anthropic refuses 400s the
            // entire conversation, not just that tool. `anthropicToolSchema` is a no-op
            // on a well-formed schema (same reference ⇒ same bytes ⇒ same prompt cache).
            input_schema: anthropicToolSchema(t.parameters),
            ...(i === arr.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
          })),
          // Default is auto; force any tool when the caller demands it.
          ...(opts.toolChoice === "required" ? { tool_choice: { type: "any" } } : {}),
        }
      : {}),
  });
}
