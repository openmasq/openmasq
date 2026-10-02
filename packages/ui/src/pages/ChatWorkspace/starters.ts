import { BRAND } from "@openmasq/branding";
import type { Messages, StarterId } from "@openmasq/i18n";
/**
 * The empty-thread prompt starters.
 *
 * ⚠️ **Read this before putting an integration starter back.** The home screen once had a
 * second row, « Avec vos services » (sort your mailbox, prepare your day…) plus chips
 * offering to connect Gmail, Drive, Agenda. It was removed: the integrations it pushed
 * were not operational for a new user (Google keys-only while it reviews the app), so the
 * first screen promised what the first click could not deliver. A starter here must work
 * on ANY install, with nothing connected. Connectors are reached from Réglages → Connecteurs.
 */
export interface Starter {
  /** Stable key — the words (category, prompt) live in the catalogue under this id:
   *  `starterCopy` reads them; `EmptyPromptSuggestions` keys its glyph on it. */
  id: StarterId;
}

/** A starter's category and prompt in `t`'s language. Every prompt takes the brand's
 *  domain (the follow-up card names an address on it). */
export function starterCopy(s: Starter, t: Messages): { cat: string; prompt: string } {
  const c = t.conversation.starters;
  return { cat: c.cats[s.id], prompt: c.prompts[s.id](BRAND.domain) };
}

/** The starters — each one SHOWS the masking (invented personal data in the prompt; the
 *  catalogue entry says why), plus the memory gesture. */
export const UNIVERSAL_STARTERS: Starter[] = [
  { id: "follow-up" },
  { id: "contract-review" },
  { id: "hr-review" },
  // Teaches the MÉMOIRE's conversational gesture — an explicit « retiens que… » needs
  // no opt-in, so this one cannot fail either. Why the sentence is what it is: see the
  // catalogue entry (`fr/conversation.ts`, `starters.prompts.memory`).
  { id: "memory" },
];

/**
 * The cards the home screen shows.
 *
 * `memoryOpen` (default: true) removes the « Retiens que… » starter when access to Memory
 * is closed — it is a TEACHING starter whose whole ending is the clickable caption leading
 * to the graph: without that screen it teaches a gesture visible nowhere. Injected so this
 * module stays pure (`starters.test.ts` has no global state to reset).
 */
export function pickStarters(opts?: { memoryOpen?: boolean }): Starter[] {
  return UNIVERSAL_STARTERS.filter((s) => s.id !== "memory" || opts?.memoryOpen !== false);
}
