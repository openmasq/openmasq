import { estimateCost, MODEL_PRICING } from "@openmasq/llm";
import type { Conversation, Message } from "../types";
import { findModelAny } from "../prompt/models";

/** Aggregate token usage for one conversation (summed over its messages). */
export interface ConversationUsage {
  inputTokens: number;
  outputTokens: number;
  total: number;
}

/** Per-model usage rolled up across many conversations. */
export interface ModelUsage {
  /** Model id (as stored on the message). */
  model: string;
  /** Human label from the registry, falling back to the id. */
  label: string;
  inputTokens: number;
  outputTokens: number;
  total: number;
  /** How many assistant turns (prompts answered) this model produced. */
  messages: number;
  /** Estimated USD cost from token counts × list price (0 when unpriced). */
  costUsd: number;
  /** Whether a list price is known for this model (else cost is not shown). */
  priced: boolean;
}

/**
 * Which billing path to count: `"all"` (both + unattributed), `"byo"` (direct on the
 * user's own key) or `"subscription"` (through the app's metered gateway/credits). A
 * turn recorded before `usage.billed` was tracked matches ONLY `"all"` — see
 * `countUnbilled` for the « Inconnu » total shown alongside a filtered view.
 */
export type BilledFilter = "all" | "byo" | "subscription";

function each(
  messages: Message[],
  billed: BilledFilter = "all",
): { model: string; input: number; output: number }[] {
  return messages
    .filter((m) => m.usage && (billed === "all" || m.usage.billed === billed))
    .map((m) => ({
      model: m.usage!.model,
      input: m.usage!.inputTokens,
      output: m.usage!.outputTokens,
    }));
}

/**
 * Count assistant turns that carry usage but no `billed` attribution (persisted
 * before it was tracked). Shown as an « Inconnu » total when a billing filter is
 * active, so old data is acknowledged rather than silently dropped.
 */
export function countUnbilled(conversations: Conversation[]): number {
  let n = 0;
  for (const conv of conversations)
    for (const m of conv.messages) if (m.usage && !m.usage.billed) n += 1;
  return n;
}

/**
 * How many of the counted turns carry OUR estimate rather than the provider's numbers
 * (Stop, a dropped stream, a provider that never reports). The Usage view says so
 * instead of presenting a mixed total as if it were all measured — the figures are
 * about money, and an unqualified number invites a precision it does not have.
 */
export function countEstimated(
  conversations: Conversation[],
  billed: BilledFilter = "all",
): number {
  let n = 0;
  for (const conv of conversations)
    for (const m of conv.messages)
      if (m.usage?.estimated && (billed === "all" || m.usage.billed === billed)) n += 1;
  return n;
}

/** Sum the token usage recorded on a conversation's messages. */
export function conversationUsage(conv: Conversation): ConversationUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of each(conv.messages)) {
    inputTokens += u.input;
    outputTokens += u.output;
  }
  return { inputTokens, outputTokens, total: inputTokens + outputTokens };
}

/** Whether a conversation has any recorded usage (for conditional UI). */
export function hasUsage(conv: Conversation): boolean {
  return conv.messages.some((m) => m.usage);
}

/**
 * Roll usage up per model across all conversations, sorted by total tokens
 * descending. The label comes from the model registry when known.
 */
export function usageByModel(
  conversations: Conversation[],
  billed: BilledFilter = "all",
): ModelUsage[] {
  const by = new Map<string, ModelUsage>();
  for (const conv of conversations) {
    for (const u of each(conv.messages, billed)) {
      const row =
        by.get(u.model) ??
        {
          model: u.model,
          label: findModelAny(u.model)?.label ?? u.model,
          inputTokens: 0,
          outputTokens: 0,
          total: 0,
          messages: 0,
          costUsd: 0,
          priced: !!MODEL_PRICING[u.model],
        };
      row.inputTokens += u.input;
      row.outputTokens += u.output;
      row.total += u.input + u.output;
      row.messages += 1;
      row.costUsd += estimateCost(u.model, u.input, u.output);
      by.set(u.model, row);
    }
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

/** Format an estimated USD cost for display (compact, French-ish). */
/** Thin-space thousands grouping for token counts (e.g. 12345 → "12 345"). Sits beside
 *  `formatUsd`: the two format the SAME roll-up, and the token one used to live in
 *  `pages/ChatWorkspace/` where a `containers/` modal had to reach up for it. */
export function formatTokens(n: number): string {
  // Un compteur non fini se DIT, il ne s'affiche pas en « NaN » : une seule conversation
  // dont le blob d'usage est incomplet (import, schéma plus ancien) suffisait à faire du
  // total du panneau Usage un « NaN » en 38 px de display.
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("fr-FR").replace(/ /g, "\u202f");
}

export function formatUsd(n: number): string {
  if (n <= 0) return "—";
  if (n < 0.01) return "< 0,01 $";
  return `${n.toFixed(2).replace(".", ",")} $`;
}
