import { redact } from "@openmasq/redact";
/** The chip's count runs SYNCHRONOUSLY on the UI thread, so it keeps its own small bound —
 *  a display figure, not the scan: the redaction itself covers the whole document
 *  (`redactAttachment.ts`, `MAX_FILE_CHARS`). */
const CHIP_COUNT_CHARS = 50_000;

/** Synchronous chip match-count, BOUNDED so a giant file doesn't block the UI thread.
 *  Takes the conversation's `disabledKinds`: without them the « N valeurs » badge counts
 *  categories the user switched off, and the store persists that number. */
export function redactMatchCount(text: string | undefined, disabledKinds: string[]): number {
  if (!text) return 0;
  const scan = text.length > CHIP_COUNT_CHARS ? text.slice(0, CHIP_COUNT_CHARS) : text;
  return redact(scan, disabledKinds.length ? { disabledKinds } : undefined).matches.length;
}
