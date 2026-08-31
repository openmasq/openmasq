// Deriving the real→fake map for the PDF/scan viewers — from a live detector run
// (`pdfReplacements`, chunked + cancellable) or deterministically from an existing
// conversation vault (`vaultReplacements`). Pure and DOM-free; the correlation/paint
// halves are `pdfMatch.ts` / `pdfRedact.ts`, and the `@openmasq/redact/pdf-redact`
// subpath re-exports all three.
import { toneForKind } from "../highlight/segments";
import { redactionCategory } from "../kinds";
import type { RedactionResult } from "../types";
import type { PdfReplacement } from "./pdfMatch";

/** The FINE category (e.g. "name", "email") a hover type-chip shows — normalised from
 *  a raw detector/model category ("NAME"/"ORG") so every surface reads consistently.
 *  Undefined when no category is known (the chip is then omitted). */
const chipKind = (raw?: string): string | undefined => (raw ? redactionCategory(raw) : undefined);

/** Settings-bound pseudonymise (model + regex) — see the desktop `useRedaction`.
 *  Accepts an optional AbortSignal so a long document redaction is cancellable, AND
 *  an optional SHARED `vault` (fake→real) so multi-chunk redaction stays consistent:
 *  threading ONE vault across chunks makes fakes atomic (same real → same fake, and —
 *  crucially — the allocator's collision guard spans chunks so two DIFFERENT reals can
 *  never draw the SAME fake). A `RedactFn` that ignores the arg still works (each chunk
 *  gets an independent vault); the output-level guard in `pdfReplacements` is the
 *  belt-and-suspenders for that case. The optional `convCategories` is the CONVERSATION's
 *  category override — absent when there is no conversation (the Library viewer); a
 *  `RedactFn` bound to a conversation merges it ON TOP of the global settings, same
 *  precedence as the send (`effectiveRedactCategories`). */
export type RedactFn = (
  text: string,
  signal?: AbortSignal,
  vault?: Record<string, string>,
  convCategories?: Record<string, boolean>,
) => Promise<RedactionResult>;

/**
 * Pseudonymise `text` and return the real→fake map with a tone per value (longest
 * first, so a value containing another is replaced first), plus `modelError` if
 * the AI detector failed. Only depends on `@openmasq/redact` → portable.
 */
export async function pdfReplacements(
  text: string,
  redact: RedactFn,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    /** The conversation's category override, forwarded to every `redact` call —
     *  absent when there is no conversation (e.g. the Library viewer). */
    convCategories?: Record<string, boolean>;
    /** ⚠️ The caller's SHARED vault (fake→real), MUTATED here. Without it, each call
     *  allocates in a fresh vault: two attachments from the same folder gave TWO
     *  fakes for the same person, and the model concluded they named different
     *  people (measured 15/08/2026, real Kbis + real agreement in principle). Passing it
     *  guarantees the invariant "one real value → ONE fake" beyond a single document.
     *  Absent ⇒ unchanged behaviour (one vault per call). */
    vault?: Record<string, string>;
  },
): Promise<{ replacements: PdfReplacement[]; modelError?: string }> {
  if (!text.trim()) return { replacements: [] };
  const signal = opts?.signal;
  // A big (multi-page) document is redacted in CHUNKS: a progress bar can advance and
  // a cancel stays responsive BETWEEN chunks. Fakes stay CONSISTENT across chunks even
  // with a fresh vault each — results are deduped by REAL value (first fake wins) and
  // the paint applies each real everywhere, so a name split across pages resolves to
  // one fake. Split on line boundaries under a char budget (never mid-name); a small
  // doc is a single pass (total 1).
  const chunks = chunkText(text);
  const total = chunks.length;
  const seen = new Set<string>();
  const out: PdfReplacement[] = [];
  let modelError: string | undefined;
  // ONE vault threaded across every chunk → fakes are atomic AND collision-free: the
  // allocator's guard, now spanning chunks, never gives two different reals the same
  // fake (the leak fixed here — a clobbered vault entry used to drop a value to clear).
  const vault: Record<string, string> = opts?.vault ?? {};
  // Belt-and-suspenders for a `RedactFn` that ignores the shared vault (e.g. a caller
  // wired before this change): guarantee at the OUTPUT that two DIFFERENT reals never
  // share a fake — remap a colliding fake to a unique variant (still reversible: this
  // map is the single source for BOTH the paint and the persisted vault).
  // Seeded from the shared vault: the uniqueness guard must know the pairs ALREADY
  // assigned by a previous piece, or it would "de-duplicate" a legitimate fake.
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
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const res = await redact(chunks[i], signal, vault, opts?.convCategories);
    if (res.modelError) modelError = res.modelError;
    for (const m of res.matches) {
      if (!m.value || seen.has(m.value)) continue;
      seen.add(m.value);
      const raw = m.category ?? m.type;
      out.push({ real: m.value, fake: uniqueFake(m.value, m.placeholder), tone: toneForKind(raw ?? ""), kind: chipKind(raw) });
    }
    opts?.onProgress?.(i + 1, total);
  }
  out.sort((a, b) => b.real.length - a.real.length);
  return { replacements: out, modelError };
}

/** A value longer than this never occurs — so an OVERLAP this wide guarantees any PII
 *  value straddling a chunk boundary is wholly contained in the NEXT chunk (fixes the
 *  mid-value hard-split leak). */
const CHUNK_OVERLAP = 256;

/** Split text into ≤~6k-char chunks, capped at ~25 chunks so a huge doc gets bigger
 *  chunks instead of hundreds of round-trips. **Never cuts mid-value:** each cut is
 *  backed up to the last whitespace in the window, and consecutive chunks OVERLAP by
 *  {@link CHUNK_OVERLAP} chars — so a value spanning a boundary is fully present in one
 *  chunk (the duplicate detection is deduped by real value in `pdfReplacements`). */
function chunkText(text: string): string[] {
  const budget = Math.max(6000, Math.ceil(text.length / 25));
  if (text.length <= budget) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + budget, text.length);
    if (end < text.length) {
      // Back up to the last newline/space so we don't slice through a value; only if a
      // reasonable break exists (past the window midpoint) — else accept a hard cut, the
      // overlap below still recovers a straddling value.
      const win = text.slice(i, end);
      const ws = Math.max(win.lastIndexOf("\n"), win.lastIndexOf(" "));
      if (ws > budget * 0.5) end = i + ws + 1;
    }
    chunks.push(text.slice(i, end));
    if (end >= text.length) break;
    // Next chunk starts BEFORE the cut so a value crossing `end` is whole in it.
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return chunks;
}

/**
 * Build the real→fake map DETERMINISTICALLY from an existing conversation vault
 * (`fake → original`) instead of re-running the model. Use this to render the
 * redacted preview of an ALREADY-SENT document: the vault already holds every
 * value that was redacted (and its exact fake), so the preview matches the wire
 * EXACTLY, needs no inference (instant, can't "fail" to 2 items), and injects no
 * fresh/inconsistent fakes. `kinds` (original → category) drives the tone; absent
 * ⇒ a default tone. Values that don't occur in the document are simply not found
 * by `renderRedactedPdf` and paint nothing.
 */
export function vaultReplacements(
  vault: Record<string, string>,
  kinds?: Record<string, string>,
): PdfReplacement[] {
  const out: PdfReplacement[] = [];
  const seen = new Set<string>();
  for (const [fake, real] of Object.entries(vault)) {
    if (!real || seen.has(real)) continue;
    seen.add(real);
    const raw = kinds?.[real];
    out.push({ real, fake, tone: toneForKind(raw ?? ""), kind: chipKind(raw) });
  }
  // Longest first so a value isn't clipped by a shorter substring of it.
  out.sort((a, b) => b.real.length - a.real.length);
  return out;
}
