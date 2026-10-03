// Masking a document's text CHUNK BY CHUNK into one real→fake map — the drop-time run
// (`pdfReplacements`) and the run that starts while a PDF is still being READ
// (`createChunkMasker` fed with the pages streamed so far) are the SAME loop, so a document
// masked as it is read ends with exactly the map a whole-text run produces. Pure, DOM-free.
import { toneForKind } from "../highlight/segments";
import { redactionCategory } from "../kinds";
import type { RedactionResult } from "../types";
import type { PdfReplacement } from "./pdfMatch";

/** The FINE category (e.g. "name", "email") a hover type-chip shows — normalised from
 *  a raw detector/model category ("NAME"/"ORG") so every surface reads consistently.
 *  Undefined when no category is known (the chip is then omitted). */
export const chipKind = (raw?: string): string | undefined => (raw ? redactionCategory(raw) : undefined);

/** What a chunked run has masked so far. */
export interface PartialMask {
  /** Offsets into the masked text: `covered` ≤ `scanned`. Every value STARTING before
   *  `covered` is in `replacements`; a value found later may still occur there. */
  covered: number;
  scanned: number;
  replacements: PdfReplacement[];
}

/** Settings-bound pseudonymise (model + regex) — see the desktop `useRedaction`.
 *  Accepts an optional AbortSignal so a long document redaction is cancellable, AND
 *  an optional SHARED `vault` (fake→real) so multi-chunk redaction stays consistent:
 *  threading ONE vault across chunks makes fakes atomic (same real → same fake, and —
 *  crucially — the allocator's collision guard spans chunks so two DIFFERENT reals can
 *  never draw the SAME fake). The optional `convCategories` is the CONVERSATION's
 *  category override — absent when there is no conversation (the Library viewer). */
export type RedactFn = (
  text: string,
  signal?: AbortSignal,
  vault?: Record<string, string>,
  convCategories?: Record<string, boolean>,
) => Promise<RedactionResult>;

/** A value longer than this never occurs — so an OVERLAP this wide guarantees any PII
 *  value straddling a chunk boundary is wholly contained in the NEXT chunk. */
export const CHUNK_OVERLAP = 256;

/** The smallest chunk, and how chunks grow with their OFFSET (a chunk starting at `s` is
 *  ≥ s / CHUNK_GROWTH). ⚠️ The budget depends on where the chunk STARTS, never on the
 *  whole length: that is what makes the chunks of a prefix the chunks of the whole text
 *  (masking can start before the text is complete). Growing with the offset keeps the count
 *  logarithmic — each call pays for the whole vault, so 1M chars in fixed 6k chunks (175)
 *  masked 3.6× slower than 25 chunks; this policy does 35, as fast (measured 2026-10-03,
 *  `longPasteDoc`, pseudonymise pass: 5.8 s vs 6.2 s for the length-scaled 25). */
const MIN_CHUNK = 6000;
const CHUNK_GROWTH = 8;
const chunkBudget = (start: number): number => Math.max(MIN_CHUNK, Math.ceil(start / CHUNK_GROWTH));

/**
 * Where the chunk starting at `start` ends, or `null` when `text` does not decide it yet
 * (not `final` and its window is not followed by more text). Never cuts mid-value: the cut
 * backs up to the last whitespace in the window when one lies past its midpoint, and the
 * next chunk starts {@link CHUNK_OVERLAP} before the cut.
 */
function chunkEnd(text: string, start: number, final: boolean): number | null {
  const budget = chunkBudget(start);
  if (start + budget >= text.length) return final ? text.length : null;
  const win = text.slice(start, start + budget);
  const ws = Math.max(win.lastIndexOf("\n"), win.lastIndexOf(" "));
  return ws > budget * 0.5 ? start + ws + 1 : start + budget;
}

const nextStart = (start: number, end: number): number => Math.max(end - CHUNK_OVERLAP, start + 1);

/** How many chunks remain in the final `text` from offset `from`. */
function chunksFrom(text: string, from: number): number {
  let n = 0;
  for (let i = from; i < text.length; ) {
    const end = chunkEnd(text, i, true) as number;
    n++;
    if (end >= text.length) break;
    i = nextStart(i, end);
  }
  return n;
}

export interface AdvanceOptions {
  /** `text` is the WHOLE text: its last chunk is masked too. Otherwise only the chunks
   *  the prefix decides (more text may follow). */
  final?: boolean;
  signal?: AbortSignal;
  /** After each chunk: chunks done (all runs), the total (0 when not `final`: unknown yet),
   *  what is masked so far. */
  onProgress?: (done: number, total: number, partial: PartialMask) => void;
}

/** One document's chunked masking, resumable as its text grows. */
export interface ChunkMasker {
  /** Mask every chunk `text` decides, one after the other. Calls are serialised. Rejects on
   *  abort, and when `text` does not continue what was masked (`continues`). */
  advance(text: string, o?: AdvanceOptions): Promise<void>;
  /** Does `text` extend what was masked — same characters, and every cut still holds? */
  continues(text: string): boolean;
  partial(): PartialMask;
  /** The map, longest real first; complete once a `final` advance resolved. */
  result(): { replacements: PdfReplacement[]; modelError?: string };
  /** Chunks masked so far. */
  readonly done: number;
  /** A `final` advance completed: the map covers the whole text. */
  readonly finished: boolean;
}

export const DIVERGED = "texte du document modifié pendant le masquage";

export function createChunkMasker(
  redact: RedactFn,
  opts?: { vault?: Record<string, string>; convCategories?: Record<string, boolean> },
): ChunkMasker {
  // ONE vault threaded across every chunk → fakes are atomic AND collision-free.
  const vault: Record<string, string> = opts?.vault ?? {};
  // Belt-and-suspenders for a `RedactFn` that ignores the shared vault: two DIFFERENT reals
  // never share a fake at the OUTPUT. Seeded from the vault, so a legitimate pair assigned
  // by an earlier run is never « de-duplicated ».
  const fakeToReal = new Map<string, string>(Object.entries(vault));
  const uniqueFake = (real: string, fake: string): string => {
    const owner = fakeToReal.get(fake);
    if (owner === undefined || owner === real) {
      fakeToReal.set(fake, real);
      return fake;
    }
    let n = 2;
    let f = `${fake} (${n})`;
    while (fakeToReal.has(f) && fakeToReal.get(f) !== real) f = `${fake} (${++n})`;
    fakeToReal.set(f, real);
    return f;
  };
  const seen = new Set<string>();
  const out: PdfReplacement[] = [];
  let modelError: string | undefined;
  let next = 0;
  let scanned = 0;
  let done = 0;
  let finished = false;
  // What the cuts made so far depend on: these characters, and (for a cut inside a window)
  // that the text goes on past `mustExceed`.
  let relied = "";
  let mustExceed = -1;
  let chain: Promise<void> = Promise.resolve();

  const continues = (text: string) =>
    finished ? text === relied : text.length > mustExceed && text.startsWith(relied);
  const sorted = () => [...out].sort((a, b) => b.real.length - a.real.length);
  const partial = (): PartialMask => ({ covered: finished ? scanned : next, scanned, replacements: sorted() });

  async function run(text: string, o: AdvanceOptions): Promise<void> {
    const final = !!o.final;
    if (!continues(text)) throw new Error(DIVERGED);
    const total = final ? done + chunksFrom(text, next) : 0;
    while (!finished) {
      if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const end = next >= text.length ? (final ? text.length : null) : chunkEnd(text, next, final);
      if (end === null) return;
      if (end > next) {
        const res = await redact(text.slice(next, end), o.signal, vault, opts?.convCategories);
        if (res.modelError) modelError = res.modelError;
        for (const m of res.matches) {
          if (!m.value || seen.has(m.value)) continue;
          seen.add(m.value);
          const raw = m.category ?? m.type;
          out.push({ real: m.value, fake: uniqueFake(m.value, m.placeholder), tone: toneForKind(raw ?? ""), kind: chipKind(raw) });
        }
        done++;
        scanned = end;
      }
      if (end >= text.length) {
        finished = true;
        relied = text;
      } else {
        mustExceed = Math.max(mustExceed, next + chunkBudget(next));
        if (mustExceed > relied.length) relied = text.slice(0, mustExceed);
        next = nextStart(next, end);
      }
      o.onProgress?.(done, total, partial());
    }
  }

  return {
    advance(text, o = {}) {
      const step = chain.then(() => run(text, o));
      chain = step.catch(() => undefined);
      return step;
    },
    continues,
    partial,
    result: () => ({ replacements: sorted(), modelError }),
    get done() {
      return done;
    },
    get finished() {
      return finished;
    },
  };
}

/**
 * Pseudonymise `text` and return the real→fake map with a tone per value (longest
 * first, so a value containing another is replaced first), plus `modelError` if the AI
 * detector failed. A multi-page document is masked in chunks (`createChunkMasker`): a
 * progress bar can advance and a cancel stays responsive BETWEEN chunks.
 *
 * `opts.vault` is the caller's SHARED vault (fake→real), MUTATED here: without it two
 * attachments from the same folder gave TWO fakes for the same person (measured
 * 15/08/2026). Absent ⇒ one vault per call. `onProgress` reports, after each chunk, what is
 * masked SO FAR for a progressive preview — PROVISIONAL until `done === total`.
 */
export async function pdfReplacements(
  text: string,
  redact: RedactFn,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, partial: PartialMask) => void;
    convCategories?: Record<string, boolean>;
    vault?: Record<string, string>;
  },
): Promise<{ replacements: PdfReplacement[]; modelError?: string }> {
  if (!text.trim()) return { replacements: [] };
  const masker = createChunkMasker(redact, { vault: opts?.vault, convCategories: opts?.convCategories });
  await masker.advance(text, { final: true, signal: opts?.signal, onProgress: opts?.onProgress });
  return masker.result();
}
