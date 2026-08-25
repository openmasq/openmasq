/**
 * Sliding context window for a long conversation.
 *
 * The send pipeline (`store.ts`) sends the FULL conversation history every turn — there
 * was no trimming, so once the accumulated messages exceeded the model's context window
 * the PROVIDER rejected the request ("context length exceeded") with no graceful
 * degradation. `fitHistoryToContext` slides a token window over the thread: it keeps the
 * leading SYSTEM message (date preamble + guidance + rules) and the MOST RECENT turns that
 * fit a budget derived from the model's context window, dropping the oldest. When any turn
 * is dropped, an omission marker is folded into the system message so the model knows the
 * start of the conversation is no longer visible and doesn't reference content it can't see.
 *
 * Pure (no React / no side effects) + unit-tested. Token counts are the same cheap
 * `chars/4` heuristic the tool router uses — precision isn't needed, only a safe bound.
 */
import type { ChatMessage } from "@openmasq/llm";
import { summaryCovers, summaryMarker, type ContextSummary } from "./contextSummary";

const CHARS_PER_TOKEN = 4; // matches the tool router's estimate
const PER_MESSAGE_OVERHEAD = 4; // role/formatting tokens per message
const IMAGE_TOKENS = 800; // flat cost for an image attachment (can't size from text)

/** Rough token estimate for one message. */
export function estimateMessageTokens(m: ChatMessage): number {
  const chars = (m.content ?? "").length;
  const atts = (m as { attachments?: unknown[] }).attachments;
  const imgs = Array.isArray(atts) ? atts.length : 0;
  return Math.ceil(chars / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD + imgs * IMAGE_TOKENS;
}

export interface FitHistoryResult {
  /** The windowed history (system + omission marker + most-recent fitting turns). */
  messages: ChatMessage[];
  /** How many older turns were dropped (0 = nothing trimmed). */
  dropped: number;
}

/**
 * Keep the system message + the most-recent turns that fit within a token budget derived
 * from the model's context window; drop the oldest.
 *
 * - `contextTokens` = `contextWindow(modelId)`. Unknown (undefined) ⇒ NO trimming (returns
 *   the input unchanged — the pre-existing behaviour, never worse).
 * - `reserveTokens` leaves room for the reply + (agentic) tool schemas the loop appends
 *   AFTER this trim, so history alone never claims the whole window.
 * - The FINAL message (the current user turn) is ALWAYS kept, even if it alone exceeds the
 *   budget — we can't send without it; the provider error is then the backstop.
 * - The kept window is aligned to START on a user turn (a leading assistant message is
 *   dropped too) so providers that require the first non-system message to be `user`
 *   (Anthropic) don't reject it.
 */
export function fitHistoryToContext(
  messages: ChatMessage[],
  opts: { contextTokens?: number; reserveTokens?: number; summary?: ContextSummary } = {},
): FitHistoryResult {
  const ctx = opts.contextTokens;
  if (!ctx || messages.length <= 2) return { messages, dropped: 0 };

  const hasSystem = messages[0]?.role === "system";
  const system = hasSystem ? messages[0] : undefined;
  const rest = hasSystem ? messages.slice(1) : messages; // the user/assistant turns
  if (rest.length <= 1) return { messages, dropped: 0 };

  const systemTokens = system ? estimateMessageTokens(system) : 0;
  const budget = Math.max(0, ctx - (opts.reserveTokens ?? 0) - systemTokens);

  // Walk NEWEST → oldest, keeping turns while they fit; the last turn is unconditional.
  const keptReversed: ChatMessage[] = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(rest[i]);
    const isLast = i === rest.length - 1;
    if (!isLast && used + t > budget) break;
    keptReversed.push(rest[i]);
    used += t;
  }
  const kept = keptReversed.reverse();
  // Align the window to start on a user turn (Anthropic requires it); never empty it.
  while (kept.length > 1 && kept[0].role === "assistant") kept.shift();

  const dropped = rest.length - kept.length;
  if (dropped === 0) return { messages, dropped: 0 };

  // A compaction (`contextSummary.ts`) replaces the loss with a recap of exactly the turns
  // that went. It is used ONLY when it covers every dropped turn: a summary that stops short
  // would leave a silent hole inside a confident-sounding recap, which is worse than the
  // honest marker. Its text is WIRE (fakes), so it needs no re-redaction on the way out.
  const marker = summaryCovers(opts.summary, dropped)
    ? summaryMarker(opts.summary!, dropped)
    : `\n\n[Contexte : les ${dropped} message(s) les plus ANCIENS de cette conversation ont été ` +
      `omis pour tenir dans la fenêtre de contexte du modèle. Le tout début de la conversation ` +
      `n'est plus visible ; appuie-toi sur les messages ci-dessous.]`;
  const out: ChatMessage[] = system
    ? [{ ...system, content: (system.content ?? "") + marker }, ...kept]
    : [{ role: "system", content: marker.trimStart() } as ChatMessage, ...kept];
  return { messages: out, dropped };
}
