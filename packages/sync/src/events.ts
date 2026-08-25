/**
 * Derive ORG AUDIT facts from local conversations — the compliance signal an
 * organization gets about its members' redaction activity. Privacy invariant:
 * only **aggregate counts** leave the device (how many of each PII class per
 * provider), NEVER a value or a placeholder. This is the same payload shape the
 * backend's `/organizations/:org/events/redaction` endpoint already ingests.
 *
 * One event per conversation: `types` counts distinct redacted values grouped by
 * their category (`redactionKinds`), `total` is their sum. Counting distinct
 * values (not occurrences) matches how the popup's audit log reads the vault.
 */
import type { RedactionEvent } from "./types";

/** The minimal per-conversation shape we need — every surface's `Conversation`
 *  is a superset of this (vault + kinds + a model id). */
export interface AuditSource {
  redactionVault?: Record<string, string>;
  redactionKinds?: Record<string, string>;
  modelId?: string;
}

/** Map a stored model id to a coarse provider label for the org dashboard. */
export function providerFromModelId(modelId = ""): string {
  const m = modelId.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "google";
  if (m.includes("mistral")) return "mistral";
  if (m.includes("gpt") || m.includes("chatgpt") || m.includes("openai")) return "openai";
  return "chatgpt";
}

/** Build one aggregate event for a conversation, or null if nothing was redacted. */
export function deriveRedactionEvent(conv: AuditSource): RedactionEvent | null {
  const kinds = conv.redactionKinds ?? {};
  const seen = new Set<string>();
  const types: Record<string, number> = {};
  let total = 0;
  for (const original of Object.values(conv.redactionVault ?? {})) {
    if (!original || seen.has(original)) continue;
    seen.add(original);
    const cat = kinds[original] ?? "secret";
    types[cat] = (types[cat] ?? 0) + 1;
    total++;
  }
  if (total === 0) return null;
  return { provider: providerFromModelId(conv.modelId), model: conv.modelId ?? null, types, total };
}

/** Derive events for a batch of conversations (skips the empty ones). */
export function deriveRedactionEvents(convs: AuditSource[]): RedactionEvent[] {
  return convs.map(deriveRedactionEvent).filter((e): e is RedactionEvent => e !== null);
}
