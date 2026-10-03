import type { Messages } from "@openmasq/i18n";
import type { Settings } from "../../types";
import { raceRedactionWork, type RedactFn } from "../../send/redactionEngine";
import type { Attachment } from "./Composer";
import { pdfReplacements } from "../../containers/modals/viewers/pdf/pdfReplacements";
import { redactEngineSig } from "./redactEngineSig";
import { describeRedactFailure } from "../../send/redaction";
import { pushDebug } from "../../state/debug/debug";
import { attachmentVault } from "./attachmentVault";
import { maskPlan, maskTimeoutMs } from "@openmasq/redact";
import { redactTimeoutMessage } from "../../send/redactTimeout";

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
  /** The UI language of the failure text shown on the chip. */
  t: Messages;
}

/**
 * Run (or RE-run) redaction for ONE attachment, in place — the drop-time file redaction,
 * cancellable + chunked + progress-reported, stamping the engine signature on success and a
 * user-safe warning on failure, and logging the substitution to the Debug Log.
 *
 * ⚠️ The WHOLE extracted text is masked, never a first slice. The map this produces is what
 * the send reuses (`reusableDocReplacements`) and what the library's masked copy of a
 * DOCX/XLSX is scrubbed with (`files:redact-and-save`), so a value seen only past the wire
 * cut must be in it. A text too long to mask in
 * full (`maskPlan`, `@openmasq/redact`) is REFUSED with `redactError` — which `submitGuard`
 * refuses to send — and a run past its deadline (`maskTimeoutMs`) fails the same way.
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
  ctrls.delete(a.cid);
  const plan = maskPlan(a.text.length);
  if (plan.kind === "refuse") {
    const why = deps.t.composer.attachments.tooLongToMask(plan.pages);
    // No map at all: a stale one from a shorter read must not ride a send either.
    updateAttachment(a.cid, { redacting: false, redactProgress: undefined, replacements: undefined, redactEngineSig: undefined, redactError: why });
    pushDebug({ type: "error", scope: "document-redaction", message: `${a.name}: ${a.text.length} chars — ${why}` }, convId);
    return;
  }
  const ctrl = new AbortController();
  ctrls.set(a.cid, ctrl);
  updateAttachment(a.cid, { redacting: true, redactError: undefined, redactProgress: undefined });
  // Deadline scaled to the text (same constants as the estimate): past it the run is
  // abandoned and the chip FAILS (redactError → « Réessayer »), never sendable unmasked.
  const deadline = maskTimeoutMs(a.text.length);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, deadline);
  ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  const timeoutError = () => describeRedactFailure(redactTimeoutMessage(deadline), deps.t, settings?.redactEngine);
  // Raced against the signal HERE too: the deadline must not depend on the engine honouring
  // the abort mid-chunk (a wedged detector would otherwise leave the chip masking forever).
  const work = pdfReplacements(a.text, redactAsync, {
    signal: ctrl.signal,
    // Multi-chunk (multi-page) doc → advance a progress bar on the chip.
    onProgress: (done, total) => {
      if (!ctrl.signal.aborted) updateAttachment(a.cid, { redactProgress: { done, total } });
    },
    convCategories,
    // ⚠️ The CONVERSATION's vault, shared by all its attachments: without it, two
    // documents from the same folder gave two fakes to the same person (`attachmentVault.ts`).
    vault: convId ? attachmentVault(convId, convVault) : undefined,
  });
  raceRedactionWork(work, { signal: ctrl.signal })
    .then(({ replacements, modelError }) => {
      clearTimeout(timer);
      if (timedOut) throw new Error(redactTimeoutMessage(deadline)); // too late: a failure, below
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
        redactError: modelError ? describeRedactFailure(modelError, deps.t, settings?.redactEngine) : undefined,
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
          error: modelError ? describeRedactFailure(modelError, deps.t, settings?.redactEngine) : undefined,
        },
        convId,
      );
    })
    .catch((e) => {
      clearTimeout(timer);
      if (ctrl.signal.aborted && !timedOut) return; // user-cancelled — no error, no stale update
      if (ctrls.get(a.cid) === ctrl) ctrls.delete(a.cid);
      updateAttachment(a.cid, {
        redacting: false,
        redactProgress: undefined,
        redactError: timedOut
          ? timeoutError()
          : describeRedactFailure(e instanceof Error ? e.message : String(e), deps.t, settings?.redactEngine),
      });
      pushDebug(
        {
          type: "error",
          scope: "document-redaction",
          message: `${a.name}: ${timedOut ? redactTimeoutMessage(deadline) : e instanceof Error ? e.message : String(e)}`,
        },
        convId,
      );
    });
}
