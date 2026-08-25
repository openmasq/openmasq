import type { ChatMessage } from "@openmasq/llm";
import type { TurnMessage } from "../state/debug";

/**
 * Pure builders for the journal's per-TOUR `turn` entries: the request side of one
 * model exchange of the agentic loop, capped for the ring buffer. Everything here is
 * WIRE form (redacted) — the exact bytes the provider receives, which is what makes a
 * provider 400 diagnosable from the journal alone. Kept out of `mcpAgent.ts` (pure,
 * testable, and that file is already over the LOC cap).
 */

// Per-message caps. A DELTA entry logs only what this tour appended (tool results are
// already capped upstream at 8/16k), so it can stay tight; the FAILURE dump is the one
// chance to see the whole request, so it keeps more.
const DELTA_MSG_CAP = 4000;
const FAIL_MSG_CAP = 8000;
/** Past this many offered tools, keep the first N names + a count (314 names per tour
 *  would dominate the ring buffer for no diagnostic value). */
const TOOL_NAMES_CAP = 40;

/** Cap a string keeping head + tail (the interesting parts of a wire message). */
function capText(s: string, cap: number): { text: string; truncatedFrom?: number } {
  if (s.length <= cap) return { text: s };
  const head = Math.floor(cap * 0.75);
  const tail = cap - head;
  return {
    text: `${s.slice(0, head)}\n[… ${s.length - cap} car. omis …]\n${s.slice(s.length - tail)}`,
    truncatedFrom: s.length,
  };
}

/** One wire message → a journal row. An assistant turn's tool CALLS are folded into
 *  the content (they ARE the message when the prose is empty). */
function toTurnMessage(m: ChatMessage, cap: number): TurnMessage {
  let content = m.content ?? "";
  if (m.role === "assistant" && m.toolCalls?.length) {
    const calls = m.toolCalls
      .map((c) => `[tool_call ${c.name} ${JSON.stringify(c.arguments ?? {})}]`)
      .join("\n");
    content = content ? `${content}\n${calls}` : calls;
  }
  const capped = capText(content, cap);
  const role = m.role === "tool" ? `tool(${m.toolCallId ?? "?"})` : m.role;
  return { role, content: capped.text, ...(capped.truncatedFrom ? { truncatedFrom: capped.truncatedFrom } : {}) };
}

/** The messages APPENDED since the previous tour (`from` = the count already logged). */
export function turnRequestDelta(messages: readonly ChatMessage[], from: number): TurnMessage[] {
  return messages.slice(Math.max(0, from)).map((m) => toTurnMessage(m, DELTA_MSG_CAP));
}

/** The COMPLETE request — the failure dump. */
export function turnRequestFull(messages: readonly ChatMessage[]): TurnMessage[] {
  return messages.map((m) => toTurnMessage(m, FAIL_MSG_CAP));
}

/** The offered tool NAMES, capped (count survives in the entry's `toolsOffered`). */
export function turnToolNames(defs: readonly { name: string }[]): string[] {
  const names = defs.map((d) => d.name);
  return names.length <= TOOL_NAMES_CAP
    ? names
    : [...names.slice(0, TOOL_NAMES_CAP), `… +${names.length - TOOL_NAMES_CAP}`];
}

/** A response tool call for the entry — args serialized + capped. */
export function turnToolCall(c: { name: string; arguments?: unknown }): { name: string; args: string } {
  let args: string;
  try {
    args = JSON.stringify(c.arguments ?? {});
  } catch {
    args = String(c.arguments);
  }
  return { name: c.name, args: capText(args, 2000).text };
}
