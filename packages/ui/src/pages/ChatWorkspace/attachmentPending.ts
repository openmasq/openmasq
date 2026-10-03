import type { Messages } from "@openmasq/i18n";
import { estimateMaskMs, maskPlan } from "@openmasq/redact";
import type { Attachment } from "./Composer";

type PendingFields = Pick<
  Attachment,
  "extracting" | "extractProgress" | "extractQueued" | "redacting" | "redactProgress" | "replacements"
>;

/** The preview has nothing redacted to show yet: the file is still being READ, or its
 *  FIRST masking pass is running. A re-run (replacements already there) keeps the real
 *  preview, which carries its own « remasquage » state. While pending, the preview shows
 *  a loader — never the document unmasked under a « masqué » label. */
export function isPreviewPending(a: PendingFields): boolean {
  return !!a.extracting || (!!a.redacting && a.replacements === undefined);
}

/** The in-progress line shared by the chip and the pending preview: the page being read
 *  (a paginated OCR — the user thinks in pages), else the masking percentage — with the
 *  minutes left for a LONG document (`maskPlan`, from its character count). `null` when
 *  the file is neither being read nor masked. */
export function progressLabel(a: PendingFields & { chars?: number }, t: Messages): string | null {
  const at = t.composer.attachments;
  if (a.extracting) {
    if (a.extractQueued !== undefined && a.extractQueued > 0) return at.stateQueued(a.extractQueued);
    const p = a.extractProgress;
    return p && p.total > 1 ? at.stateReadingPage(Math.min(p.done + 1, p.total), p.total) : at.stateReading;
  }
  if (a.redacting) {
    const p = a.redactProgress;
    const left = longMaskingMinutesLeft(a);
    if (left !== null) {
      return p && p.total > 1 ? at.stateMaskingLong(Math.round((p.done / p.total) * 100), left) : at.maskingLong(left);
    }
    return p && p.total > 1 ? at.stateMaskingPct(Math.round((p.done / p.total) * 100)) : at.stateMasking;
  }
  return null;
}

/** Minutes left (at least 1) of a LONG document's masking, from its size and progress;
 *  `null` when the document is not long. An estimate (`estimateMaskMs`), for the copy only. */
export function longMaskingMinutesLeft(a: Pick<Attachment, "redactProgress"> & { chars?: number }): number | null {
  const chars = a.chars ?? 0;
  if (maskPlan(chars).kind !== "long") return null;
  const p = a.redactProgress;
  const leftShare = p && p.total > 0 ? 1 - p.done / p.total : 1;
  return Math.max(1, Math.ceil((estimateMaskMs(chars) * leftShare) / 60_000));
}

/** The chip patch for one extraction progress event: waiting its turn (`queued`), or
 *  reading a page — one replaces the other, so a started file never still says « waiting ». */
export function extractProgressPatch(p: {
  done: number;
  total: number;
  queued?: number;
}): Pick<Attachment, "extractQueued" | "extractProgress"> {
  return p.queued !== undefined
    ? { extractQueued: p.queued, extractProgress: undefined }
    : { extractQueued: undefined, extractProgress: { done: p.done, total: p.total } };
}

/** Whether a progress event (the channel is shared by every extraction in flight) is
 *  about this file: by PATH when the event carries one — two picked files may share a
 *  name — else by name (the bytes route has no path). */
export function isProgressFor(
  p: { name: string; path?: string },
  file: { name: string; path?: string },
): boolean {
  return p.path !== undefined ? p.path === file.path : p.name === file.name;
}
