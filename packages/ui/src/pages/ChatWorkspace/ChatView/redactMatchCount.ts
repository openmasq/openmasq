import { LONG_MASK_CHARS, redact } from "@openmasq/redact";

/** Synchronous chip match-count — a SEED shown until the drop-time masking stamps the
 *  count of its full map (`redactAttachment.ts`). It counts the WHOLE text or nothing:
 *  a count over a first slice would claim a total it never saw. Past `LONG_MASK_CHARS` the
 *  synchronous regex pass would freeze the UI thread (≈ 5 s at 1M characters), so a long
 *  text gets no seed (0) and the chip shows the masking progress until the full count lands.
 *  Takes the conversation's `disabledKinds`: without them the « N valeurs » badge counts
 *  categories the user switched off, and the store persists that number. */
export function redactMatchCount(text: string | undefined, disabledKinds: string[]): number {
  if (!text || text.length > LONG_MASK_CHARS) return 0;
  return redact(text, disabledKinds.length ? { disabledKinds } : undefined).matches.length;
}
