import { contextWindow } from "@openmasq/llm";
import { CHARS_PER_TOKEN } from "@openmasq/llm/wire";
import type { Message } from "../types";
import { isAutoModelId } from "./autoRoute";

/**
 * What the documents of a conversation weigh on the model's context — DISPLAY ONLY.
 * Nothing here changes what is sent or masked: the send re-sends each turn's persisted
 * `modelContent` (typed text + folded documents, `buildWire.ts`) until the history window
 * (`historyWindow.ts`) drops the oldest turns. These helpers only say so to the user.
 *
 * A document is counted from what will actually ride again: a user turn's `modelContent`
 * beyond its typed `content` — the WHOLE document, and across a restart too (the desktop DB
 * restores it, `messages.model_content`). A turn without `modelContent` (none folded, or a
 * turn saved before that column existed) re-sends nothing and weighs nothing.
 */

/** From this share of the window on, the composer says what the documents cost. */
export const DOC_WEIGHT_NOTICE_SHARE = 0.5;

export type DocumentWeight = { modelId: string; share: number; limit: number };

/** The documents' share of `modelId`'s window, when it reaches {@link DOC_WEIGHT_NOTICE_SHARE}.
 *  Auto (it picks a model that fits) and an unknown window say nothing, as `contextFit.ts`. */
export function documentWeight(p: {
  modelId: string | undefined;
  messages: readonly Message[];
}): DocumentWeight | null {
  if (!p.modelId || isAutoModelId(p.modelId)) return null;
  const limit = contextWindow(p.modelId);
  if (!limit) return null;
  let chars = 0;
  for (const m of p.messages) {
    if (m.role !== "user" || !m.modelContent || !m.attachments?.length) continue;
    chars += Math.max(0, m.modelContent.length - m.content.length);
  }
  const share = chars / CHARS_PER_TOKEN / limit;
  return share >= DOC_WEIGHT_NOTICE_SHARE ? { modelId: p.modelId, share, limit } : null;
}

/**
 * The documents the history window just stopped sending. `fitHistoryToContext` drops a
 * PREFIX of the prior turns (`dropped` of them, the current turn always kept), so the lost
 * documents are those of `prior.slice(0, dropped)` — minus any name a KEPT turn carries
 * again (attached anew, it is still in front of the model).
 */
export function droppedDocumentNames(prior: readonly Message[], dropped: number): string[] {
  if (dropped <= 0) return [];
  const carried = (m: Message) => (m.role === "user" && m.modelContent ? (m.attachments ?? []) : []);
  const kept = new Set(prior.slice(dropped).flatMap((m) => carried(m).map((a) => a.name)));
  const names = prior.slice(0, dropped).flatMap((m) => carried(m).map((a) => a.name));
  return [...new Set(names)].filter((n) => !kept.has(n));
}
