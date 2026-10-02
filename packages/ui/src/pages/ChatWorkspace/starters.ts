import { BRAND } from "@openmasq/branding";
import type { Messages, StarterId } from "@openmasq/i18n";
/**
 * The empty-thread prompt starters.
 *
 * ⚠️ **Never an OFFER to connect here.** The home screen once offered Gmail, Drive, Agenda…
 * to a fresh install: integrations a new user could not use, so the first screen promised
 * what the first click could not deliver. An integration card now appears ONLY for a service
 * that is CONNECTED — it then works, on the user's own data. Connecting stays in Réglages →
 * Connecteurs.
 */
export interface Starter {
  /** Stable key — the words (category, prompt) live in the catalogue under this id:
   *  `starterCopy` reads them; `EmptyPromptSuggestions` keys its glyph on it. */
  id: StarterId;
}

export interface IntegrationStarter extends Starter {
  /** The catalogue ids that can serve it — the same job, a different service per user
   *  (files are OneDrive OR Dropbox). The first CONNECTED one names the card. */
  connectors: string[];
}

/** A starter with the connected service it speaks for (integration cards only). */
export interface PickedStarter extends Starter {
  connectorId?: string;
}

/** A starter's category and prompt in `t`'s language. `service` is the connected product's
 *  display name for an integration card (the prompt says where to look), « » otherwise. */
export function starterCopy(s: Starter, t: Messages, service = ""): { cat: string; prompt: string } {
  const c = t.conversation.starters;
  return { cat: c.cats[s.id], prompt: c.prompts[s.id](BRAND.domain, service) };
}

/** Work with nothing connected — each one SHOWS the masking (invented personal data in the
 *  prompt; the catalogue entry says why), plus the memory gesture. */
export const UNIVERSAL_STARTERS: Starter[] = [
  { id: "follow-up" },
  { id: "contract-review" },
  { id: "hr-review" },
  // Teaches the MÉMOIRE's conversational gesture — an explicit « retiens que… » needs
  // no opt-in, so this one cannot fail either. Why the sentence is what it is: see the
  // catalogue entry (`fr/conversation.ts`, `starters.prompts.memory`).
  { id: "memory" },
];

/** The integrations the home screen may speak for, once CONNECTED. Ordered: the picker
 *  takes them in this order. */
export const INTEGRATION_STARTERS: IntegrationStarter[] = [
  { id: "chat-catchup", connectors: ["slack"] },
  { id: "notes-find", connectors: ["notion"] },
  { id: "files-find", connectors: ["microsoft-onedrive", "dropbox"] },
];

/**
 * The cards the home screen shows: the universal row, and one card per CONNECTED service
 * among `INTEGRATION_STARTERS` (empty on a fresh install — no offer, ever).
 *
 * `memoryOpen` (default: true) removes the « Retiens que… » starter when access to Memory
 * is closed — it is a TEACHING starter whose whole ending is the clickable caption leading
 * to the graph: without that screen it teaches a gesture visible nowhere. Injected so this
 * module stays pure (`starters.test.ts` has no global state to reset).
 */
export function pickStarters(
  connectedIds: readonly string[] = [],
  opts?: { memoryOpen?: boolean },
): { universal: Starter[]; integrations: PickedStarter[] } {
  const connected = new Set(connectedIds);
  const integrations: PickedStarter[] = [];
  for (const s of INTEGRATION_STARTERS) {
    const id = s.connectors.find((c) => connected.has(c));
    if (id) integrations.push({ id: s.id, connectorId: id });
  }
  const universal = UNIVERSAL_STARTERS.filter((s) => s.id !== "memory" || opts?.memoryOpen !== false);
  return { universal, integrations };
}
