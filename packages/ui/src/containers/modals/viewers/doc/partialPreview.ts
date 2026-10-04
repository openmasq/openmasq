import type { PartialMask } from "@openmasq/redact/pdf-redact";
import { docRevealSegments } from "./docReveal";
import type { DocChunk } from "./docSearch";

/**
 * The display chunks of a document still being masked: the part already masked, as FAKES
 * with their marks — and NOTHING of the rest (the caller draws a placeholder there).
 *
 * ⚠️ Where the shown text stops is the safety of this view:
 *  • Segments are cut from `text.slice(0, scanned)` — every value found so far lies whole
 *    in it — so a mark is never split and its real half left on screen.
 *  • Plain text stops at `covered`: past it lies the overlap the NEXT chunk re-reads, where
 *    a value straddling the chunk cut has not been searched in full yet. A mark that starts
 *    before `covered` is kept whole (it shows a fake, never the real).
 * The marks carry no `fake` attribute, so the real value never reaches the DOM (`DocText`).
 * The map is the run's CUMULATIVE one, re-applied to the whole shown part on every tick: a
 * value found in a later chunk is masked where it already shows. What stays provisional is
 * a value NOT YET reached — the view says « provisoire ».
 */
export function partialMaskedChunks(text: string, partial: PartialMask): DocChunk[] {
  const scanned = Math.min(partial.scanned, text.length);
  const covered = Math.min(partial.covered, scanned);
  const out: DocChunk[] = [];
  let at = 0; // offset in the ORIGINAL text
  for (const s of docRevealSegments(text.slice(0, scanned), partial.replacements, new Set())) {
    if (at >= covered) break;
    if (s.real) {
      out.push({ text: s.text, mark: { real: s.real, tone: s.tone ?? "slate", kind: s.kind ?? "", revealed: false } });
      at += s.real.length;
      continue;
    }
    const keep = s.text.slice(0, covered - at);
    if (keep) out.push({ text: keep });
    at += s.text.length;
  }
  return out;
}
