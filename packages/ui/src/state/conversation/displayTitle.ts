import type { Messages } from "@openmasq/i18n";

/**
 * The French default title older builds STORED on every new conversation. A new one stores
 * "" instead; this literal is only ever compared against, never written.
 */
const LEGACY_DEFAULT_TITLE = "Nouvelle conversation";

/**
 * The title a conversation SHOWS: its own, or the untitled label in the UI language. An
 * empty title and the legacy stored default both read as untitled, so a conversation
 * created before the switch does not stay French in an English interface.
 */
export function displayTitle(title: string | null | undefined, t: Messages): string {
  const own = (title ?? "").trim();
  return !own || own === LEGACY_DEFAULT_TITLE ? t.chrome.untitledConversation : own;
}
