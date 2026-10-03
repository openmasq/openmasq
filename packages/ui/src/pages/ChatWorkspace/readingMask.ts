import { STREAM_MAX_PAGES, streamedPrefix } from "@openmasq/redact/documents.browser";
import { createChunkMasker, type ChunkMasker } from "@openmasq/redact/pdf-redact";
import { maskTimeoutMs } from "@openmasq/redact";
import type { ExtractStream } from "../../host";
import type { RedactFn } from "../../send/redactionEngine";
import { maskQueue, type JobQueue } from "../../state/files/maskQueue";
import type { Settings } from "../../types";
import { attachmentVault } from "./attachmentVault";
import type { ReadingState } from "./Composer";
import { redactEngineSig } from "./redactEngineSig";
import { patchStaged, type StagedStore } from "./stagedStore";

export interface ReadingMaskDeps {
  cid: string;
  store: StagedStore;
  stagedKey: string;
  settings: Settings | undefined;
  orgForcedCategories?: string[];
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
  /** The file's bytes (a drop holds them; a picked file has its granted `path` instead). Kept
   *  until the first stream event — proof the extraction accepted the file and is reading a
   *  PDF — then put on the chip, so the preview can draw the document while it is read. */
  bytes(data: string): void;
  /** The read ended. `ok`: it produced the file's text — the masking started here is handed
   *  to the file's run (`takeReadingMask`); otherwise everything streamed is dropped. */
  end(ok: boolean): void;
}

/** A masking started while the file was read, waiting for the file's run to continue it. */
const handoffs = new Map<string, { masker: ChunkMasker; sig: string }>();

/**
 * The masking a read started for `cid` — taken ONCE, and only when it can continue into the
 * file's text: same engine signature (settings, org policy, conversation categories) and a
 * text that extends what was masked (`ChunkMasker.continues`). Anything else: `undefined`,
 * and the run masks the whole text from scratch (never less than a whole-text run).
 */
export function takeReadingMask(cid: string, sig: string, text: string): ChunkMasker | undefined {
  const h = handoffs.get(cid);
  handoffs.delete(cid);
  return h && h.sig === sig && h.masker.continues(text) ? h.masker : undefined;
}

/** The chip left (removed, refused): forget its handed-off masking. */
export function dropReadingMask(cid: string): void {
  handoffs.delete(cid);
}

/**
 * THE masking of a PDF, started while it is READ: each page's final text (streamed by the
 * extraction, `pageStream.ts`) is masked chunk by chunk as soon as the chunk is decided, with
 * the real engine, into the conversation's real working vault — the very run
 * `redactAttachment` would have done afterwards (`createChunkMasker`: the same chunks, the
 * same map). When the read ends, that run CONTINUES on the file's text: only the tail is
 * left. Measured on a 26-page statement (2026-10-03): read 50 s + mask 29 s = 79 s in
 * sequence, ~71 s overlapped (OCR and the detector share the CPU), where masking every page
 * twice — once for a preview, once for real — took ~100 s.
 *
 * What stays safe:
 *  • `replacements` (what the send and the library use) is written ONLY by the file's run,
 *    once the WHOLE text is masked — the send stays blocked until then (`submitGuard`);
 *  • what is shown meanwhile (`reading.mask`) is provisional and display-only: a value
 *    found later may still mark a page already shown, and the viewer repaints it;
 *  • a detector error, a stuck chunk (deadline) or anything unexpected stops this early
 *    run: the file's run then masks the whole text from scratch (fail closed);
 *  • the chip removed ⇒ the job is cancelled and every later event ignored;
 *  • the queue still runs ONE masking at a time: this is a job like any other.
 */
export function startReadingMask(d: ReadingMaskDeps): ReadingSession {
  const queue = d.queue ?? maskQueue;
  const key = `reading:${d.cid}`;
  const sig = redactEngineSig(d.settings, d.orgForcedCategories, d.convCategories);
  // The SAME vault the file's run uses: the map must be the run's, not a preview's.
  const vault = d.convId ? attachmentVault(d.convId, d.convVault) : undefined;
  const masker = d.settings ? createChunkMasker(d.redactAsync, { vault, convCategories: d.convCategories }) : null;
  const texts: (string | undefined)[] = [];
  let state: ReadingState = { total: 0, thumbs: [], read: [] };
  let stopped = false;
  let ended = false;
  let broken = false;
  /** The prefix length an advance last found nothing decidable in. */
  let idleAt = -1;
  let held: string | undefined;

  const stop = () => {
    stopped = true;
    queue.cancel(key);
    dropReadingMask(d.cid);
  };
  const publish = (next: ReadingState | undefined) => {
    if (next) state = next;
    // The chip left (removed, sent, conversation deleted): stop, write nothing more.
    if (!patchStaged(d.store, d.stagedKey, d.cid, { reading: next })) stop();
  };
  const grow = (total: number) => Math.min(Math.max(state.total, total), STREAM_MAX_PAGES);
  const prefix = () => streamedPrefix(texts);
  const showMask = () => {
    if (!masker || broken) return publish({ ...state, mask: undefined });
    const { pages } = prefix();
    const p = masker.partial();
    publish({ ...state, mask: { ...p, pageTexts: texts.slice(0, pages) as string[] } });
  };
  const fail = () => {
    // FAIL CLOSED: nothing provisional is shown, and the file's run starts over.
    broken = true;
    dropReadingMask(d.cid);
    publish({ ...state, mask: undefined });
  };

  async function run(queueSignal: AbortSignal): Promise<void> {
    if (!masker) return;
    const ctrl = new AbortController();
    queueSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    for (;;) {
      if (stopped || broken || ctrl.signal.aborted) return;
      // Trailing whitespace is not in the final text (it is trimmed): never lean on it.
      const text = prefix().text.trimEnd();
      const before = masker.done;
      // A chunk past its deadline (a wedged detector) ends this early run, never the file.
      const timer = setTimeout(() => {
        fail();
        ctrl.abort();
      }, maskTimeoutMs(text.length));
      try {
        await masker.advance(text, { signal: ctrl.signal, onProgress: () => !stopped && showMask() });
      } catch {
        if (!stopped && !ctrl.signal.aborted) fail();
        return;
      } finally {
        clearTimeout(timer);
      }
      if (masker.result().modelError) return fail();
      if (masker.done === before) {
        idleAt = text.length;
        return;
      }
    }
  }

  const schedule = () => {
    if (!masker || stopped || ended || broken || queue.has(key)) return;
    if (prefix().text.trimEnd().length <= idleAt) return; // nothing new to decide
    queue.enqueue({
      key,
      group: d.stagedKey,
      // A page that arrived while this job was finishing is picked up by a fresh one.
      run: (signal) => run(signal).finally(() => setTimeout(schedule, 0)),
    });
  };

  return {
    bytes(data) {
      if (!stopped && !ended) held = data;
    },
    push(ev) {
      if (stopped || ended) return;
      if (held !== undefined) {
        const data = held;
        held = undefined;
        if (!patchStaged(d.store, d.stagedKey, d.cid, { data })) return stop();
      }
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
      if (stopped || ended) return;
      ended = true;
      if (!ok) {
        stop();
        publish(undefined);
        return;
      }
      // The job still running finishes the chunks it can; the file's run, queued behind
      // it, takes the masker over (`takeReadingMask`) and masks the rest.
      if (masker && !broken) handoffs.set(d.cid, { masker, sig });
    },
  };
}
