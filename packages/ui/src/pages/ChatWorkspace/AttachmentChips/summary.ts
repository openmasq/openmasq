import type { Messages } from "@openmasq/i18n";
import type { Attachment } from "../Composer";

/** From this many staged files the row gets a summary line, a bounded scrollable area
 *  and « Tout retirer ». Below it the row is exactly the plain chips. */
export const MANY_FILES = 8;

export interface StagedSummary {
  total: number;
  reading: number;
  masking: number;
  /** Nothing could be read (an extraction that failed or a refused file). */
  unreadable: number;
}

export function stagedSummary(attachments: Attachment[]): StagedSummary {
  const s: StagedSummary = { total: attachments.length, reading: 0, masking: 0, unreadable: 0 };
  for (const a of attachments) {
    if (a.extracting) s.reading++;
    else if (a.redacting) s.masking++;
    else if (a.error && !a.text?.trim()) s.unreadable++;
  }
  return s;
}

/** « 32 fichiers · 3 en lecture · 1 illisible » — a zero count is left out. */
export function summaryLine(s: StagedSummary, t: Messages): string {
  const c = t.composer.attachments;
  const parts = [c.summaryFiles(s.total)];
  if (s.reading) parts.push(c.summaryReading(s.reading));
  if (s.masking) parts.push(c.summaryMasking(s.masking));
  if (s.unreadable) parts.push(c.summaryUnreadable(s.unreadable));
  return parts.join(" · ");
}
