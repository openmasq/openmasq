import type { Messages } from "@openmasq/i18n";
import type { ExtractedFile, FilesHost } from "../../host";
import type { Attachment } from "./Composer";
import { extractProgressPatch, isProgressFor } from "./attachmentPending";

export interface ExtractPickedDeps {
  extract: FilesHost["extract"];
  update(cid: string, patch: Partial<Attachment>): void;
  countMatches(text: string): number;
  /** A file is read: journal it, then mask it (or warn on its error). */
  onRead(file: ExtractedFile, attachment: Attachment): void;
  /** The copy a failed chip shows. */
  t: Messages;
  warn(message: string): void;
}

/**
 * Extract picked files ONE CALL PER FILE. Main runs them one at a time (its extraction
 * queue), and each chip finishes — so it opens, and starts masking — as soon as ITS file
 * is read, not when the slowest of the batch is. A failure stays on its own chip.
 */
export function extractPicked(placeholders: Attachment[], deps: ExtractPickedDeps): void {
  for (const ph of placeholders) {
    deps
      .extract([ph.path!], (prog) => {
        if (!isProgressFor(prog, ph)) return; // the progress channel is shared
        deps.update(ph.cid, extractProgressPatch({ done: prog.page, total: prog.pages, queued: prog.queued }));
      })
      .then(([f]) => {
        if (!f) {
          deps.update(ph.cid, { extracting: false, extractQueued: undefined, error: deps.t.composer.attachments.extractFailed });
          return;
        }
        const merged: Attachment = { ...ph, ...f, extracting: false, redactPreview: deps.countMatches(f.text) };
        deps.update(ph.cid, {
          ...f,
          extracting: false,
          extractProgress: undefined,
          extractQueued: undefined,
          redactPreview: merged.redactPreview,
          redacting: !!f.text.trim(),
        });
        deps.onRead(f, merged);
      })
      .catch((e) => {
        deps.update(ph.cid, { extracting: false, extractQueued: undefined, error: deps.t.composer.attachments.extractFailed });
        deps.warn(e instanceof Error ? e.message : String(e));
      });
  }
}
