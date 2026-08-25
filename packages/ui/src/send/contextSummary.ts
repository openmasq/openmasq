/**
 * Context compaction — what a long conversation keeps when it stops fitting.
 *
 * `historyWindow.ts` slides a token window and drops the oldest turns. That keeps the
 * provider from rejecting the request, but the beginning of the conversation is simply
 * GONE: the brief, the constraints, the decisions taken in the first twenty messages. The
 * model then contradicts them, and the only signal the user gets is a one-line marker.
 *
 * A compaction replaces the loss with a summary. This module owns the pure half — the
 * record, when it may be used, the prompt, and how the result is folded back into the wire.
 * The pass that produces one is `state/useContextCompaction.ts`.
 *
 * ## Why this is egress-neutral, and why that is the whole design
 *
 * The summary is built from the **WIRE** turns (`memory/extract.ts` `wireTurns`) — the
 * fakes the model already received, re-derived from the conversation's own vault. So:
 *  - producing it sends **no new real value** anywhere;
 *  - the summary itself contains only fakes, so it can be stored and re-injected **as is**,
 *    with no re-redaction step to get wrong.
 *
 * That is why it is NOT modelled on the Mémoire, which is stored real and re-redacted at
 * injection: the Mémoire crosses conversations (where fakes are not stable, per the
 * per-conversation salt), a compaction never does. ⚠️ **It must never leave its
 * conversation** — the same fake means a different person elsewhere.
 */
import type { ChatMessage } from "@openmasq/llm";

export interface ContextSummary {
  /** How many of the conversation's WIRE turns this summary covers, counted from the
   *  start. The window may drop at most this many before the summary stops covering it. */
  throughTurn: number;
  /** Wire text (fakes only). */
  text: string;
  at: number;
  /** Which model wrote it — shown to the user, and a cheap staleness signal. */
  model?: string;
}

/** Below this there is nothing worth compacting: the window is not trimming yet, and a
 *  summary of six messages is longer than the six messages. */
export const COMPACT_MIN_TURNS = 24;

/** Compaction runs again once this many NEW turns have accumulated past the last one —
 *  otherwise every send would re-summarise for one extra message. */
export const COMPACT_STRIDE = 16;

/** Hard cap on the stored summary. A summary that grows without bound re-creates the
 *  problem it solves. */
export const SUMMARY_MAX_CHARS = 4_000;

/**
 * A summary is usable for THIS send when it covers every turn the window dropped. When it
 * covers fewer, the uncovered head would be silently missing from an otherwise
 * confident-sounding recap — worse than the honest "N messages omitted" marker.
 */
export function summaryCovers(summary: ContextSummary | undefined, dropped: number): boolean {
  return !!summary && summary.text.trim().length > 0 && summary.throughTurn >= dropped;
}

/** How many turns the next pass should cover, or null when it is not worth running. */
export function nextCompactionTarget(
  totalTurns: number,
  summary: ContextSummary | undefined,
): number | null {
  if (totalTurns < COMPACT_MIN_TURNS) return null;
  // Never summarise the tail: the recent turns are in the window anyway, and folding them
  // in would have the model read the same content twice, once degraded.
  const target = totalTurns - Math.floor(COMPACT_STRIDE / 2);
  if (target <= 0) return null;
  if (summary && target - summary.throughTurn < COMPACT_STRIDE) return null;
  return target;
}

/** The instruction. Deliberately asks for FACTS AND DECISIONS rather than prose: what a
 *  resumed model needs is the constraints it must not contradict, not a narrative. */
export function compactionPrompt(wire: string, previous?: string): string {
  return [
    "Tu résumes le DÉBUT d'une conversation pour qu'un assistant puisse la reprendre sans en avoir le texte.",
    "",
    "Écris un mémo dense, en français, structuré en puces courtes. Retiens EXCLUSIVEMENT :",
    "- ce que la personne veut obtenir, et les contraintes qu'elle a posées ;",
    "- les décisions prises et les choix écartés (avec la raison) ;",
    "- les faits durables (noms, chiffres, dates, références) tels qu'ils sont écrits ;",
    "- ce qui reste en suspens.",
    "",
    "N'invente rien, ne commente pas, ne conclus pas. Recopie les noms et identifiants À L'IDENTIQUE.",
    `Maximum ${Math.floor(SUMMARY_MAX_CHARS / 6)} mots.`,
    ...(previous
      ? ["", "Mémo précédent, à ÉTENDRE (garde ce qui vaut encore, corrige ce qui a changé) :", previous]
      : []),
    "",
    "Conversation :",
    wire,
  ].join("\n");
}

/** Bound and clean what the model returned. An empty result is `null` — never an empty
 *  summary, which would read as "nothing happened in the first thirty messages". */
export function parseSummary(reply: string | undefined): string | null {
  const text = (reply ?? "")
    .replace(/^```[a-z]*\n?|```$/g, "")
    .trim()
    .slice(0, SUMMARY_MAX_CHARS);
  return text.length >= 20 ? text : null;
}

/**
 * The block that replaces the bare omission marker. It says three things the model needs:
 * the head is gone, here is what it said, and the summary is a summary — so a detail it
 * does not contain must be asked for rather than invented.
 */
export function summaryMarker(summary: ContextSummary, dropped: number): string {
  return (
    `\n\n[Contexte : les ${dropped} message(s) les plus ANCIENS de cette conversation ne sont plus ` +
    `visibles ; en voici le résumé, établi à partir de ces messages. C'est un RÉSUMÉ : s'il te ` +
    `manque un détail précis, demande-le plutôt que de le supposer.]\n` +
    `<résumé-du-début>\n${summary.text}\n</résumé-du-début>`
  );
}

/** Turn a conversation's messages into the labelled turns the pass summarises. */
export function compactableTurns(
  messages: ChatMessage[],
): { role: "user" | "assistant"; text: string }[] {
  return messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } =>
      (m.role === "user" || m.role === "assistant") && !!m.content?.trim(),
    )
    .map((m) => ({ role: m.role, text: m.content }));
}
