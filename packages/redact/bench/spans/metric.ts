/**
 * Span-level scoring for the public-benchmark comparison — the protocol of Perplexity's
 * PII-TRACE paper, reproduced so our numbers and theirs can sit in one table:
 *
 *   character P/R/F1     pooled over the corpus: precision = share of the characters an
 *                        engine marked that are annotated PII, recall = share of the
 *                        annotated PII characters it marked.
 *   span-overlap F1      a gold span is found when ANY of its characters is marked; a
 *                        predicted span is right when it touches any annotation.
 *   span-containment F1  a gold span is found only when ALL its characters are marked; a
 *                        predicted span is right only when it lies entirely inside annotation.
 *   consistency          share of the identifiers whose EVERY mention is fully covered,
 *                        by number of mentions (1 · 2 · 3–5 · 6–10 · 11+), and for the
 *                        recurring ones (≥ 2) overall.
 *   by length            character P/R/F1 pooled inside < 1 k · 1–10 k · ≥ 10 k characters.
 *   by language, by label
 *
 * Categories are NOT required to match (Perplexity scores its external benchmarks the same
 * way): a name found as a company is found. Two VIEWS of the gold, both reported:
 *   all   — every upstream label except `ctx` (the comparable number);
 *   in    — only the labels the product claims (`adapt.py` says which, per dataset).
 * Precision is the same in both views and never charges an engine for marking an
 * annotated datum we chose not to score — the `CONTEXT` rule of `../metric.ts`.
 */

export interface GoldSpan { start: number; end: number; label: string; entity: string; scope: "in" | "out" | "ctx" }
export interface SpanCase { id: string; lang: string; text: string; spans: GoldSpan[]; meta?: Record<string, string> }
export type PredSpan = [start: number, end: number];
export type View = "all" | "in";

export interface PRF { p: number; r: number; f1: number; tp: number; pred: number; gold: number }
export interface Scores {
  cases: number;
  char: PRF;
  overlap: PRF;
  containment: PRF;
  consistency: { buckets: Record<string, [ok: number, n: number]>; recurring: [ok: number, n: number] };
  byLength: Record<string, PRF>;
  byLang: Record<string, PRF>;
  byLabel: Record<string, { gold: number; charRecall: number; contained: number; spans: number }>;
}

function mark(len: number, spans: readonly { start: number; end: number }[]): Uint8Array {
  const a = new Uint8Array(len);
  for (const s of spans) a.fill(1, Math.max(0, s.start), Math.min(len, s.end));
  return a;
}
const count = (a: Uint8Array) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };
const both = (a: Uint8Array, b: Uint8Array) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] & b[i]; return n; };
const covered = (a: Uint8Array, s: { start: number; end: number }) => { for (let i = s.start; i < s.end; i++) if (!a[i]) return false; return true; };
const touched = (a: Uint8Array, s: { start: number; end: number }) => { for (let i = s.start; i < s.end; i++) if (a[i]) return true; return false; };

export const lengthBucket = (n: number) => (n < 1000 ? "<1k" : n < 10000 ? "1k–10k" : "≥10k");
export const mentionBucket = (n: number) => (n === 1 ? "1" : n === 2 ? "2" : n <= 5 ? "3–5" : n <= 10 ? "6–10" : "11+");

interface Triple { r: number; p: number; pred: number; gold: number } // r = recall hits, p = precision hits
interface Acc { c: Triple; o: Triple; k: Triple }
const triple = (): Triple => ({ r: 0, p: 0, pred: 0, gold: 0 });
const acc = (): Acc => ({ c: triple(), o: triple(), k: triple() });
const add = (a: Triple, b: Triple) => { a.r += b.r; a.p += b.p; a.pred += b.pred; a.gold += b.gold; };
const toPRF = (t: Triple): PRF => {
  const p = t.pred ? t.p / t.pred : 0, r = t.gold ? t.r / t.gold : 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, tp: t.r, pred: t.pred, gold: t.gold };
};

export function scoreSpans(cases: readonly SpanCase[], preds: Readonly<Record<string, PredSpan[]>>, view: View): Scores {
  const total = acc();
  const byLength: Record<string, Acc> = {}, byLang: Record<string, Acc> = {};
  const byLabel: Record<string, { gold: number; hit: number; contained: number; spans: number }> = {};
  const buckets: Record<string, [number, number]> = {};
  const recurring: [number, number] = [0, 0];

  for (const c of cases) {
    const predSpans = (preds[c.id] ?? []).map(([start, end]) => ({ start, end }));
    const pred = mark(c.text.length, predSpans);
    const scored = c.spans.filter((s) => (view === "all" ? s.scope !== "ctx" : s.scope === "in"));
    const gold = mark(c.text.length, scored);
    const any = mark(c.text.length, c.spans); // precision is never charged for a real datum
    const one: Acc = {
      c: { r: both(pred, gold), p: both(pred, any), pred: count(pred), gold: count(gold) },
      o: { r: 0, p: 0, pred: predSpans.length, gold: scored.length },
      k: { r: 0, p: 0, pred: predSpans.length, gold: scored.length },
    };
    for (const s of scored) { if (touched(pred, s)) one.o.r++; if (covered(pred, s)) one.k.r++; }
    for (const s of predSpans) { if (touched(any, s)) one.o.p++; if (covered(any, s)) one.k.p++; }
    for (const a of [total, (byLength[lengthBucket(c.text.length)] ??= acc()), (byLang[c.lang] ??= acc())]) {
      add(a.c, one.c); add(a.o, one.o); add(a.k, one.k);
    }
    for (const s of scored) {
      const e = (byLabel[s.label] ??= { gold: 0, hit: 0, contained: 0, spans: 0 });
      e.spans++; e.gold += s.end - s.start; if (covered(pred, s)) e.contained++;
      for (let i = s.start; i < s.end; i++) e.hit += pred[i];
    }
    const ents = new Map<string, GoldSpan[]>();
    for (const s of scored) (ents.get(s.entity) ?? ents.set(s.entity, []).get(s.entity)!).push(s);
    for (const mentions of ents.values()) {
      const ok = mentions.every((s) => covered(pred, s));
      const b = (buckets[mentionBucket(mentions.length)] ??= [0, 0]);
      b[1]++; if (ok) b[0]++;
      if (mentions.length >= 2) { recurring[1]++; if (ok) recurring[0]++; }
    }
  }
  return {
    cases: cases.length,
    char: toPRF(total.c), overlap: toPRF(total.o), containment: toPRF(total.k),
    consistency: { buckets, recurring },
    byLength: Object.fromEntries(Object.entries(byLength).map(([k, a]) => [k, toPRF(a.c)])),
    byLang: Object.fromEntries(Object.entries(byLang).map(([k, a]) => [k, toPRF(a.c)])),
    byLabel: Object.fromEntries(Object.entries(byLabel).map(([k, e]) => [k, { gold: e.gold, charRecall: e.gold ? e.hit / e.gold : 0, contained: e.contained, spans: e.spans }])),
  };
}

export const f3 = (x: number) => x.toFixed(3);
export const pc = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "—");
