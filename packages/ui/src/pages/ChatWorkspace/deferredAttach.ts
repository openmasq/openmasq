import type { Attachment } from "./Composer";
import type { ExtractedFile } from "../../host";
import type { DeferredFile } from "../../state/files/deferredFile";

/** What `ChatView` knows how to do and this module doesn't: setting, fixing, chaining. */
export interface DeferredAttachDeps {
  /** Stages the chip — it's `ChatView` that chooses between local state and the store. */
  stage(files: Attachment[], forConvId?: string): void;
  /** Fixes a chip ALREADY set, on the same side `stage` put it on. */
  patch(cid: string, patch: Partial<Attachment>, forConvId?: string): void;
  /** The number of values the regex pass sees — the chip's 🛡 counter. */
  countMatches(text: string): number;
  /** OCR log + start of redaction, once the content is there. */
  onExtracted(file: ExtractedFile, attachment: Attachment): void;
  /** A chip identifier. Injected by the TEST only, to be deterministic. */
  newCid?(): string;
}

/** The chip as it appears BEFORE having its content: named, and already at work. */
export function placeholderFor(d: DeferredFile, cid: string): Attachment {
  return {
    name: d.name,
    ...(d.mime ? { mime: d.mime } : {}),
    kind: "",
    text: "",
    chars: 0,
    cid,
    redactPreview: 0,
    extracting: true,
  };
}

/**
 * Set the chip RIGHT AWAY, then fill it in.
 *
 * The order is everything: `stage` before the first `await`, otherwise we're back to the
 * behavior being fixed — the user clicks and nothing moves during OCR.
 *
 * ⚠️ **A failure leaves the chip, marked.** Removing it would be cleaner on the eye and
 * dishonest: the file really was requested, and a faulty chip can be retried (`retryAttachment`)
 * where a disappearance leaves nothing to do, and nothing to understand.
 */
export async function stageDeferredFile(
  d: DeferredFile,
  forConvId: string | undefined,
  deps: DeferredAttachDeps,
): Promise<void> {
  const ph = placeholderFor(d, deps.newCid?.() ?? Math.random().toString(36).slice(2));
  deps.stage([ph], forConvId);
  let file: ExtractedFile;
  try {
    // OCR progress fixes the chip page by page; a source that emits none
    // leaves the bar indeterminate (the parameter is ignored harmlessly).
    file = await d.load((p) => deps.patch(ph.cid, { extractProgress: p }, forConvId));
  } catch {
    deps.patch(ph.cid, { extracting: false, error: "extraction échouée" }, forConvId);
    return;
  }
  const redactPreview = deps.countMatches(file.text);
  deps.patch(
    ph.cid,
    // `extracting` drops and `redacting` takes over in the SAME patch: two
    // patches left the chip in a stateless frame, which reads as a failure.
    { ...file, extracting: false, extractProgress: undefined, redactPreview, redacting: !!file.text.trim() },
    forConvId,
  );
  deps.onExtracted(file, { ...ph, ...file, redactPreview });
}
