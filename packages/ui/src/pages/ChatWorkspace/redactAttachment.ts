import type { Messages } from "@openmasq/i18n";
import type { Settings } from "../../types";
import { raceRedactionWork, type RedactFn } from "../../send/redactionEngine";
import type { Attachment } from "./Composer";
import { pdfReplacements } from "../../containers/modals/viewers/pdf/pdfReplacements";
import type { PartialMask } from "@openmasq/redact/pdf-redact";
import { redactEngineSig } from "./redactEngineSig";
import { describeRedactFailure } from "../../send/redaction";
import { pushDebug } from "../../state/debug/debug";
import { maskQueue, type JobQueue } from "../../state/files/maskQueue";
import { attachmentVault } from "./attachmentVault";
import { maskPlan, maskTimeoutMs } from "@openmasq/redact";
import { redactTimeoutMessage } from "../../send/redactTimeout";
import { patchStaged, type StagedStore } from "./stagedStore";
import { dropReadingMask, takeReadingMask } from "./readingMask";

/** Component captures threaded into {@link redactAttachment} (extracted from ChatView). */
export interface RedactAttachmentDeps {
  settings: Settings | undefined;
  /** The org's MANDATED categories — part of the stamped signature, so a file redacted
   *  under a looser org policy goes stale instead of being reused by the send. */
  orgForcedCategories?: string[];
  redactAsync: RedactFn;
  /** The staging the chip lives in, and the key it was staged under (the conversation's
   *  id, `""` for the draft). Every patch goes THERE, wherever the user is meanwhile. */
  store: StagedStore;
  stagedKey: string;
  /** The masking queue — the app's one by default; a test passes its own. */
  queue?: JobQueue;
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
 * Queue (or RE-queue) redaction for ONE attachment, in place — the drop-time file redaction,
 * cancellable + chunked + progress-reported, stamping the engine signature on success and a
 * user-safe warning on failure, and logging the substitution to the Debug Log.
 *
 * ⚠️ The WHOLE extracted text is masked, never a first slice. The map this produces is what
 * the send reuses (`reusableDocReplacements`) and what the library's masked copy of a
 * DOCX/XLSX is scrubbed with (`files:redact-and-save`), so a value seen only past the wire
 * cut must be in it. A text too long to mask in
 * full (`maskPlan`, `@openmasq/redact`) is REFUSED with `redactError` — which `submitGuard`
 * refuses to send — and a run past its deadline (`maskTimeoutMs`) fails the same way.
 *
 * Runs go through ONE queue (`state/files/maskQueue.ts`): one file masked at a time, the
 * others « en attente », and a run that outlives the screen. Its deadline starts when it
 * RUNS, not while it waits. A chip no longer staged stops its run (fail closed: nothing
 * written anywhere).
 */
export function redactAttachment(a: Attachment, deps: RedactAttachmentDeps): void {
  if (!a.text.trim()) return;
  const queue = deps.queue ?? maskQueue;
  const patch = (p: Partial<Attachment>) => patchStaged(deps.store, deps.stagedKey, a.cid, p);
  // A retry replaces the previous run (or waiting turn) of this file.
  queue.cancel(a.cid);
  const plan = maskPlan(a.text.length);
  if (plan.kind === "refuse") {
    dropReadingMask(a.cid);
    const why = deps.t.composer.attachments.tooLongToMask(plan.pages);
    // No map at all: a stale one from a shorter read must not ride a send either.
    patch({ redacting: false, maskQueued: undefined, redactProgress: undefined, maskedSoFar: undefined, reading: undefined, replacements: undefined, redactEngineSig: undefined, redactError: why });
    pushDebug({ type: "error", scope: "document-redaction", message: `${a.name}: ${a.text.length} chars — ${why}` }, deps.convId);
    return;
  }
  patch({ redacting: true, redactError: undefined, redactProgress: undefined, maskedSoFar: undefined });
  queue.enqueue({
    key: a.cid,
    group: deps.stagedKey,
    onQueued: (ahead) => void patch({ maskQueued: ahead }),
    run: (signal) => runMasking(a, deps, signal),
  });
}

/** One masking run, once the file's turn came. Settles on abort (the race below). */
function runMasking(a: Attachment, deps: RedactAttachmentDeps, queueSignal: AbortSignal): Promise<void> {
  const { settings, redactAsync, convId, convCategories, convVault, t } = deps;
  const ctrl = new AbortController();
  queueSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  // The chip left (removed, sent, conversation deleted): stop, write nothing.
  const patch = (p: Partial<Attachment>) => {
    if (!patchStaged(deps.store, deps.stagedKey, a.cid, p)) ctrl.abort();
  };
  patch({ maskQueued: undefined });
  if (ctrl.signal.aborted) return Promise.resolve();
  // Which engine redacted the file (same as the send) — org-mandated categories included.
  const docEngine = redactEngineSig(settings, deps.orgForcedCategories, convCategories);
  // Deadline scaled to the text (same constants as the estimate): past it the run is
  // abandoned and the chip FAILS (redactError → « Réessayer »), never sendable unmasked.
  const deadline = maskTimeoutMs(a.text.length);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, deadline);
  ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  const startedAt = Date.now();
  const fail = (why: string) => describeRedactFailure(why, t, settings?.redactEngine);
  // The masking a READ already started (`readingMask.ts`): continued, so the pages masked
  // during the read are not masked again — same chunks, same vault, same map. Absent or
  // not continuable (another engine, another text): the whole text from scratch.
  const early = takeReadingMask(a.cid, docEngine, a.text);
  const base = early?.done ?? 0;
  // Multi-chunk (multi-page) doc → a progress bar, a time left measured on THIS run's
  // pace, and what is masked so far for the progressive preview.
  const onProgress = (done: number, total: number, partial: PartialMask) => {
    if (ctrl.signal.aborted) return;
    const ran = done - base;
    const etaMs = ran > 0 ? Math.round(((Date.now() - startedAt) * (total - done)) / ran) : undefined;
    patch({ redactProgress: { done, total, etaMs }, maskedSoFar: done < total ? partial : undefined });
  };
  // Raced against the signal HERE too: the deadline must not depend on the engine honouring
  // the abort mid-chunk (a wedged detector would otherwise leave the chip masking forever).
  const work = early
    ? early.advance(a.text, { final: true, signal: ctrl.signal, onProgress }).then(() => early.result())
    : pdfReplacements(a.text, redactAsync, {
        signal: ctrl.signal,
        onProgress,
        convCategories,
        // ⚠️ The CONVERSATION's vault, shared by all its attachments: without it, two
        // documents from the same folder gave two fakes to the same person (`attachmentVault.ts`).
        vault: convId ? attachmentVault(convId, convVault) : undefined,
      });
  // `reading`: what the read showed (`readingMask.ts`) ends with the run.
  const ended = { redacting: false, redactProgress: undefined, maskedSoFar: undefined, reading: undefined } as const;
  return raceRedactionWork(work, { signal: ctrl.signal })
    .then(({ replacements, modelError }) => {
      clearTimeout(timer);
      if (timedOut) throw new Error(redactTimeoutMessage(deadline)); // too late: a failure, below
      if (ctrl.signal.aborted) return; // cancelled — drop the stale result
      patch({
        ...ended,
        replacements,
        // The chip's 🛡 count was seeded from the SYNCHRONOUS regex pass at drop —
        // re-stamp it from the full map, or an AI engine that found more (a name, an
        // address) leaves the chip under-reporting what will actually be redacted.
        redactPreview: replacements.length,
        // Stamp the engine used (only on success) so a later engine change is detectable.
        redactEngineSig: modelError ? undefined : docEngine,
        redactError: modelError ? fail(modelError) : undefined,
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
          error: modelError ? fail(modelError) : undefined,
        },
        convId,
      );
    })
    .catch((e) => {
      clearTimeout(timer);
      if (ctrl.signal.aborted && !timedOut) return; // user-cancelled — no error, no stale update
      const message = timedOut ? redactTimeoutMessage(deadline) : e instanceof Error ? e.message : String(e);
      patch({ ...ended, redactError: fail(message) });
      pushDebug({ type: "error", scope: "document-redaction", message: `${a.name}: ${message}` }, convId);
    });
}
