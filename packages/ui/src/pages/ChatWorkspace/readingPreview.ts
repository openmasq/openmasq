import { STREAM_MAX_PAGES, streamedPrefix } from "@openmasq/redact/documents.browser";
import { CHUNK_OVERLAP, type PartialMask } from "@openmasq/redact/pdf-redact";
import type { ExtractStream } from "../../host";
import type { RedactFn } from "../../send/redactionEngine";
import { maskQueue, type JobQueue } from "../../state/files/maskQueue";
import { partialMaskedChunks } from "../../containers/modals/viewers/doc/partialPreview";
import { pdfReplacements, type PdfReplacement } from "../../containers/modals/viewers/pdf/pdfReplacements";
import type { Settings } from "../../types";
import { attachmentVault } from "./attachmentVault";
import type { ReadingState } from "./Composer";
import { patchStaged, type StagedStore } from "./stagedStore";

/** Engines the provisional preview may run: ON-DEVICE only. A preview is extra detection
 *  work on text whose read may still fail — never a reason to send it anywhere, nor to pay
 *  for it twice. Anything else (a retired off-device engine, no settings yet): no masked
 *  text in the preview, the blurred pages only. */
const PREVIEW_ENGINES: ReadonlySet<string> = new Set(["local", "patterns"]);

export interface ReadingPreviewDeps {
  cid: string;
  store: StagedStore;
  stagedKey: string;
  settings: Settings | undefined;
  redactAsync: RedactFn;
  convId?: string;
  convCategories?: Record<string, boolean>;
  convVault?: Record<string, string>;
  /** The masking queue — the app's one by default; a test passes its own. */
  queue?: JobQueue;
}

export interface ReadingSession {
  /** One event of the file's preview stream (already scoped to this file). */
  push(ev: ExtractStream): void;
  /** The read ended. `ok`: it produced the file's text — the masked preview stays on screen
   *  until the real masking replaces it; otherwise everything streamed is dropped. */
  end(ok: boolean): void;
}

/**
 * The provisional preview of a PDF while it is READ: its pages as unreadable thumbnails with
 * their state, and — page by page — the part already read, MASKED.
 *
 * ⚠️ PREVIEW ONLY. Nothing here reaches `replacements`, `maskedSoFar` or the conversation's
 * vault: the authoritative map is still the one `redactAttachment` computes on the WHOLE text
 * once it is read, so the send and the library are exactly what they were. Why not start the
 * real run early on the stable prefix: its chunking depends on the whole length, and a sparse
 * scan's text is only decided at the end — the final map would no longer be the whole-text
 * one. The cost is masking the read pages twice, on-device and only while idle.
 *
 * How it stays safe and out of the way:
 *  • the masking runs in the queue's IDLE lane — never beside a real run, preempted by one;
 *  • each run masks only what was added (plus `CHUNK_OVERLAP` back, so a value straddling a
 *    page cut is found whole) into ONE cumulative map, re-applied to the whole shown prefix;
 *  • what is shown stops `CHUNK_OVERLAP` before the end of what was masked (the next page may
 *    complete a value) and is cut by `partialMaskedChunks` — never an unmasked value;
 *  • a detector error stops the masked text altogether (fail closed: blurred pages only);
 *  • the chip removed ⇒ the run is cancelled and every later event ignored.
 */
export function startReadingPreview(d: ReadingPreviewDeps): ReadingSession {
  const queue = d.queue ?? maskQueue;
  const key = `reading:${d.cid}`;
  const canMask = !!d.settings && PREVIEW_ENGINES.has(d.settings.redactEngine);
  // A COPY of the working vault: known values keep their fake, new ones never leak into it.
  const vault: Record<string, string> = d.convId ? { ...attachmentVault(d.convId, d.convVault) } : {};
  const texts: (string | undefined)[] = [];
  const reps = new Map<string, PdfReplacement>();
  let state: ReadingState = { total: 0, thumbs: [], read: [] };
  let scanned = 0;
  let stopped = false;
  let maskFailed = false;

  const stop = () => {
    stopped = true;
    queue.cancel(key);
  };
  const publish = (next: ReadingState | undefined) => {
    if (next) state = next;
    // The chip left (removed, sent, conversation deleted): stop, write nothing more.
    if (!patchStaged(d.store, d.stagedKey, d.cid, { reading: next })) stop();
  };
  const grow = (total: number) => Math.min(Math.max(state.total, total), STREAM_MAX_PAGES);

  async function run(signal: AbortSignal): Promise<void> {
    try {
      for (;;) {
        const { text, pages } = streamedPrefix(texts);
        if (stopped || signal.aborted || text.length <= scanned) return;
        const from = Math.max(0, scanned - CHUNK_OVERLAP);
        const res = await pdfReplacements(text.slice(from), d.redactAsync, {
          signal,
          vault,
          convCategories: d.convCategories,
        });
        if (stopped || signal.aborted) return;
        if (res.modelError) throw new Error(res.modelError);
        for (const r of res.replacements) if (!reps.has(r.real)) reps.set(r.real, r);
        scanned = text.length;
        const mask: PartialMask = {
          covered: Math.max(0, scanned - CHUNK_OVERLAP),
          scanned,
          replacements: [...reps.values()].sort((a, b) => b.real.length - a.real.length),
        };
        publish({ ...state, masked: { chunks: partialMaskedChunks(text, mask), pages } });
      }
    } catch {
      if (signal.aborted || stopped) return; // preempted or cancelled: the queue re-runs it
      // FAIL CLOSED: a detector that failed would let a name through — no masked text at all.
      maskFailed = true;
      publish({ ...state, masked: undefined });
    }
  }

  const schedule = () => {
    if (!canMask || stopped || maskFailed || queue.has(key)) return;
    queue.enqueueIdle({
      key,
      group: d.stagedKey,
      // A page that arrived while this run was finishing is picked up by a fresh one.
      run: (signal) =>
        run(signal).finally(() => {
          setTimeout(() => {
            if (streamedPrefix(texts).text.length > scanned) schedule();
          }, 0);
        }),
    });
  };

  return {
    push(ev) {
      if (stopped) return;
      if (ev.thumb) {
        const { n, total, src } = ev.thumb;
        // Defence in depth: main only relays checked PNG data URLs (`extractStream.ts`).
        if (!src.startsWith("data:image/png;base64,")) return;
        const thumbs = [...state.thumbs];
        thumbs[n - 1] = src;
        publish({ ...state, total: grow(total), thumbs });
        return;
      }
      if (ev.page) {
        const { n, total, read, text } = ev.page;
        const nextRead = [...state.read];
        if (read) nextRead[n - 1] = true;
        if (text !== undefined) texts[n - 1] = text;
        publish({ ...state, total: grow(total), read: nextRead });
        if (text !== undefined) schedule();
      }
    },
    end(ok) {
      if (stopped) return;
      stop();
      publish(ok && state.masked ? state : undefined);
    },
  };
}
