import { redact } from "@openmasq/redact";
import { MAX_REDACT_CHARS } from "../redactAttachment";

/** Synchronous chip match-count, BOUNDED so a giant file doesn't block the UI thread.
 *  Takes the conversation's `disabledKinds`: without them the « N valeurs » badge counts
 *  categories the user switched off, and the store persists that number. */
export function redactMatchCount(text: string | undefined, disabledKinds: string[]): number {
  if (!text) return 0;
  const scan = text.length > MAX_REDACT_CHARS ? text.slice(0, MAX_REDACT_CHARS) : text;
  return redact(scan, disabledKinds.length ? { disabledKinds } : undefined).matches.length;
}
