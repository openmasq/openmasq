import type { Messages } from "@openmasq/i18n";
import type { Attachment } from "./Composer";

type PendingFields = Pick<Attachment, "extracting" | "extractProgress" | "redacting" | "redactProgress" | "replacements">;

/** The preview has nothing redacted to show yet: the file is still being READ, or its
 *  FIRST masking pass is running. A re-run (replacements already there) keeps the real
 *  preview, which carries its own « remasquage » state. While pending, the preview shows
 *  a loader — never the document unmasked under a « masqué » label. */
export function isPreviewPending(a: PendingFields): boolean {
  return !!a.extracting || (!!a.redacting && a.replacements === undefined);
}

/** The in-progress line shared by the chip and the pending preview: the page being read
 *  (a paginated OCR — the user thinks in pages), else the masking percentage. `null`
 *  when the file is neither being read nor masked. */
export function progressLabel(a: PendingFields, t: Messages): string | null {
  const at = t.composer.attachments;
  if (a.extracting) {
    const p = a.extractProgress;
    return p && p.total > 1 ? at.stateReadingPage(Math.min(p.done + 1, p.total), p.total) : at.stateReading;
  }
  if (a.redacting) {
    const p = a.redactProgress;
    return p && p.total > 1 ? at.stateMaskingPct(Math.round((p.done / p.total) * 100)) : at.stateMasking;
  }
  return null;
}
