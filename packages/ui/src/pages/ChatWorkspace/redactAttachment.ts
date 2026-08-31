import type { Settings } from "../../types";
import type { RedactFn } from "../../send/redactionEngine";
import type { Attachment } from "./Composer";
import { pdfReplacements } from "../../containers/modals/viewers/pdf/pdfReplacements";
import { redactEngineSig } from "./redactEngineSig";
import { describeRedactFailure } from "../../send/redaction";
import { pushDebug } from "../../state/debug";
import { attachmentVault } from "./attachmentVault";

// Upper bound on how much of an attached file's text we RUN THE REDACTION ENGINE over —
// the SAME bound the send clips each folded file to (`send/foldPayload.ts`
// `MAX_FILE_CHARS`, imported rather than mirrored, rule 9): detecting past the wire cut
// is wasted work, and a huge file (a multi-MB log) redacted synchronously on the
// renderer thread froze the app. Detection is value-based, so values found in the first
// slice are still faked everywhere they occur in the full text.
import { MAX_FILE_CHARS, clipFileText } from "../../send/foldPayload";
export { MAX_FILE_CHARS as MAX_REDACT_CHARS } from "../../send/foldPayload";

/** Component captures threaded into {@link redactAttachment} (extracted from ChatView). */
export interface RedactAttachmentDeps {
  settings: Settings | undefined;
  /** The org's MANDATED categories — part of the stamped signature, so a file redacted
   *  under a looser org policy goes stale instead of being reused by the send. */
  orgForcedCategories?: string[];
  redactAsync: RedactFn;
  /** The per-attachment in-flight AbortController map (a retry aborts the previous one). */
  ctrls: Map<string, AbortController>;
  updateAttachment: (cid: string, patch: Partial<Attachment>) => void;
  /** Conversation being composed — scopes the drop-time redaction Debug-Log entries. */
  convId?: string;
  /** That conversation's category override — same precedence as the send. Absent
   *  before a conversation exists (first message). */
  convCategories?: Record<string, boolean>;
  /** The conversation's PERSISTED vault, to seed its working vault — see
   *  `attachmentVault.ts`: this is what gives ONE fake to the same person present
   *  in TWO attachments. Absent ⇒ the working vault starts empty. */
  convVault?: Record<string, string>;
}

/**
 * Run (or RE-run) redaction for ONE attachment, in place — the drop-time file redaction,
 * cancellable + chunked + progress-reported, stamping the engine signature on success and a
 * user-safe warning on failure, and logging the substitution to the Debug Log. Byte-identical
 * to the former ChatView method (rule 7 — the file redaction is unchanged); the component
 * state it touched (settings/refs/setters) is now passed in via {@link RedactAttachmentDeps}.
 */
export function redactAttachment(a: Attachment, deps: RedactAttachmentDeps): void {
  const { settings, orgForcedCategories, redactAsync, ctrls, updateAttachment, convId, convCategories, convVault } =
    deps;
  if (!a.text.trim()) return;
  // Which engine redacted the file (same as the send) — org-mandated categories included.
  const docEngine = redactEngineSig(settings, orgForcedCategories, convCategories);
  // Abort a previous in-flight redaction for this file (a retry) + make THIS one
  // cancellable — removing the chip aborts its signal (see onRemoveAttachment).
  ctrls.get(a.cid)?.abort();
  const ctrl = new AbortController();
  ctrls.set(a.cid, ctrl);
  updateAttachment(a.cid, { redacting: true, redactError: undefined, redactProgress: undefined });
  // Bound the text the engine scans (a multi-MB log froze the app) — with the SAME
  // line-boundary clip as the wire (`clipFileText`, rule 9), so the boundary line is
  // scanned WHOLE or not sent at all: a mid-value slice shipped the fragment in clear.
  // Detection is value-based, so the fakes still apply to the whole file.
  const scanText = clipFileText(a.text, MAX_FILE_CHARS);
  pdfReplacements(scanText, redactAsync, {
    signal: ctrl.signal,
    // Multi-chunk (multi-page) doc → advance a progress bar on the chip.
    onProgress: (done, total) => {
      if (!ctrl.signal.aborted) updateAttachment(a.cid, { redactProgress: { done, total } });
    },
    convCategories,
    // ⚠️ The CONVERSATION's vault, shared by all its attachments: without it, two
    // documents from the same folder gave two fakes to the same person (`attachmentVault.ts`).
    vault: convId ? attachmentVault(convId, convVault) : undefined,
  })
    .then(({ replacements, modelError }) => {
      if (ctrl.signal.aborted) return; // cancelled — drop the stale result
      ctrls.delete(a.cid);
      updateAttachment(a.cid, {
        redacting: false,
        redactProgress: undefined,
        replacements,
        // The chip's 🛡 count was seeded from the SYNCHRONOUS regex pass at drop —
        // re-stamp it from the full map, or an AI engine that found more (a name, an
        // address) leaves the chip under-reporting what will actually be redacted.
        redactPreview: replacements.length,
        // Stamp the engine used (only on success) so a later engine change is detectable.
        redactEngineSig: modelError ? undefined : docEngine,
        redactError: modelError ? describeRedactFailure(modelError, settings?.redactEngine) : undefined,
      });
      // Monitor the drop-time file redaction in the Debug Log (Outils tab): count + the
      // engine, PLUS the redacted→original mapping (2-by-2) so the substitution is debuggable.
      pushDebug(
        {
          type: "tool",
          name: "document-redaction",
          ok: !modelError,
          args: `${a.name} · ${docEngine}`,
          result: replacements.length
            ? `${replacements.length} élément${replacements.length === 1 ? "" : "s"} redacted${replacements.length === 1 ? "" : "s"}`
            : "aucun élément détecté",
          pairs: replacements.slice(0, 100).map((r) => ({ token: r.fake, original: r.real, tone: r.tone })),
          error: modelError ? describeRedactFailure(modelError, settings?.redactEngine) : undefined,
        },
        convId,
      );
    })
    .catch((e) => {
      if (ctrl.signal.aborted) return; // user-cancelled — no error, no stale update
      ctrls.delete(a.cid);
      updateAttachment(a.cid, {
        redacting: false,
        redactProgress: undefined,
        redactError: describeRedactFailure(e instanceof Error ? e.message : String(e), settings?.redactEngine),
      });
      pushDebug(
        {
          type: "error",
          scope: "document-redaction",
          message: `${a.name}: ${e instanceof Error ? e.message : String(e)}`,
        },
        convId,
      );
    });
}
