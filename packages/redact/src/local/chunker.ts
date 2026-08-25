// Character-based text chunker for the local NER detector — a focused port of
// presidio_analyzer/chunkers/ (base_chunker.py + character_based_text_chunker.py),
// adapted to the engine's own `LocalSpan` shape instead of Presidio's
// RecognizerResult.
//
// Transformer NER models have a hard token cap (BERT ~512, GLiNER ~384) and
// silently truncate anything longer. So a long message or document MUST be split
// into overlapping windows, predicted per window, and the spans re-offset back
// into the original text + de-duplicated where windows overlap. Defaults (250
// chars / 50 overlap) mirror the presidio-ts port; the overlap must stay ≥ the
// longest entity you expect so a name/org isn't cut.

/** One NER prediction, in the coordinates of the text it was predicted over. */
export interface LocalSpan {
  start: number;
  end: number;
  label: string;
  score: number;
  /** Two-pass agreement, set ONLY when the recased second read was armed (ALL-CAPS text,
   *  see `ner.ts`): true = both reads found this span, false = only one did. Absent on a
   *  single-pass text — absence of a second read is not evidence of doubt. */
  agreed?: boolean;
}

/** Injectable inference: predict entity spans over a single chunk of text. */
export type NerPredict = (text: string) => Promise<LocalSpan[]> | LocalSpan[];

interface TextChunk {
  text: string;
  /** Start offset in the ORIGINAL text (inclusive). */
  start: number;
}

const WORD_BOUNDARY_CHARS = [" ", "\n"] as const;

export interface ChunkerOptions {
  /** Max window size in characters (windows may slightly exceed it to reach a
   *  word boundary). Keep well under the model's token cap (BERT ~512 tokens). */
  chunkSize?: number;
  /** Overlap between consecutive windows; must be ≥ the longest expected span. */
  chunkOverlap?: number;
}

export class CharacterChunker {
  readonly chunkSize: number;
  readonly chunkOverlap: number;

  constructor({ chunkSize = 250, chunkOverlap = 50 }: ChunkerOptions = {}) {
    if (chunkSize <= 0) throw new Error("chunkSize must be greater than 0");
    if (chunkOverlap < 0 || chunkOverlap >= chunkSize)
      throw new Error("chunkOverlap must be non-negative and less than chunkSize");
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /** Split into overlapping windows, each extended to the next word boundary. */
  private chunk(text: string): TextChunk[] {
    if (!text) return [];
    const chunks: TextChunk[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + this.chunkSize, text.length);
      while (end < text.length && !WORD_BOUNDARY_CHARS.includes(text[end] as never)) end += 1;
      chunks.push({ text: text.slice(start, end), start });
      if (end >= text.length) break;
      start = end - this.chunkOverlap;
    }
    return chunks;
  }

  /**
   * Predict over the whole text, chunking only when needed. Spans are returned
   * in ORIGINAL-text coordinates, with overlap duplicates removed.
   */
  async predict(text: string, predict: NerPredict): Promise<LocalSpan[]> {
    const chunks = this.chunk(text);
    if (!chunks.length) return [];
    if (chunks.length === 1) return dedupe(await predict(text));

    const all: LocalSpan[] = [];
    for (const c of chunks) {
      for (const p of await predict(c.text)) {
        all.push({ ...p, start: p.start + c.start, end: p.end + c.start });
      }
    }
    return dedupe(all);
  }
}

/**
 * Drop entities produced twice by overlapping windows: keep the higher-scoring
 * one when two same-label spans overlap by more than `overlapThreshold` of the
 * shorter span. Returned sorted by start offset.
 */
export function dedupe(spans: LocalSpan[], overlapThreshold = 0.5): LocalSpan[] {
  if (spans.length <= 1) return [...spans];
  const sorted = [...spans].sort((a, b) => b.score - a.score);
  const kept: LocalSpan[] = [];
  for (const s of sorted) {
    let dup = false;
    for (const k of kept) {
      if (s.label !== k.label) continue;
      const overlap = Math.min(s.end, k.end) - Math.max(s.start, k.start);
      if (overlap <= 0) continue;
      const shorter = Math.min(s.end - s.start, k.end - k.start);
      if (shorter > 0 && overlap / shorter > overlapThreshold) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}
