#!/usr/bin/env tsx
/**
 * Our own corpus (`../corpora/*.json`) and the committed sidecar columns, re-expressed at
 * span level so `run.mts` scores them with the same protocol as the public benchmarks.
 *
 *   pnpm exec tsx packages/redact/bench/spans/internal.mts
 *     -> data/internal.spancase.json        every exact occurrence of every annotated value
 *     -> results/internal.pplx.json         from ../pplx.labels.json (PII-Tracer's own offsets)
 *     -> results/internal.presidio.json     from ../presidio.detections.json (values, located
 *                                            in the text the way the vault is — see predict.ts)
 *
 * The truth is annotated as VALUES, not offsets: a value that occurs several times is gold at
 * every occurrence (the product substitutes them all, so should any engine). A truth that
 * appears nowhere STANDALONE in its text is out of this view — an OCR-damaged spelling the
 * token-coverage scorer forgives and an offset scorer cannot; `manifest.json` counts them
 * (`absent_verbatim`). Dropping them is KINDER to every engine, equally — a miss nobody can
 * be charged for; the value-level bench (`../compare.mts`) is where those cases still count. Scope:
 * `CONTEXT` → ctx, `AMOUNT` (a category retired by product decision, kept annotated) → out,
 * everything else → in.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeRegExp, isWordGlued } from "../../src/index";
import type { GoldSpan, PredSpan, SpanCase } from "./metric";
import { merge } from "./predict";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = join(HERE, "../corpora");
type Truth = { id: string; lang: string; text: string; truth: [string, string][] };
const cases = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as Partial<Truth>[]).filter((c) => Array.isArray(c.truth)) as Truth[]);

const occurrences = (text: string, value: string): PredSpan[] => {
  const out: PredSpan[] = [];
  if (!value) return out;
  const re = new RegExp(escapeRegExp(value), "g");
  for (let m = re.exec(text); m; m = re.exec(text)) { if (!isWordGlued(text, m.index, m[0])) out.push([m.index, m.index + m[0].length]); if (m.index === re.lastIndex) re.lastIndex++; }
  return out;
};

let absent = 0, truths = 0;
const spanCases: SpanCase[] = cases.map((c) => {
  const spans: GoldSpan[] = [];
  for (const [value, cat] of c.truth) {
    if (cat !== "CONTEXT") truths++;
    const occ = occurrences(c.text, value);
    if (!occ.length) { if (cat !== "CONTEXT") absent++; continue; }
    const scope = cat === "CONTEXT" ? "ctx" : cat === "AMOUNT" ? "out" : "in";
    for (const [start, end] of occ) spans.push({ start, end, label: cat, entity: `${cat}:${value.toLowerCase()}`, scope });
  }
  return { id: c.id, lang: c.lang, text: c.text, spans };
});
writeFileSync(join(HERE, "data/internal.spancase.json"), JSON.stringify(spanCases));
console.log(`internal: ${spanCases.length} cases · ${truths} scored truths · ${absent} not verbatim in the text (out of this view) · ${spanCases.reduce((n, c) => n + c.spans.length, 0)} spans`);

const manifestPath = join(HERE, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.internal = { upstream: "../corpora/*.json (this repository)", cases: spanCases.length, truths, absent_verbatim: absent, spans: spanCases.reduce((n, c) => n + c.spans.length, 0) };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 0));

// PII-Tracer: its own offsets, from the value-level sidecar's label file.
const labels = JSON.parse(readFileSync(join(HERE, "../pplx.labels.json"), "utf8")) as Record<string, { spans: [number, number, string, number][] }>;
const timing = JSON.parse(readFileSync(join(HERE, "../pplx.timing.json"), "utf8")) as { summary: Record<string, unknown> };
const pplx: Record<string, PredSpan[]> = {};
for (const c of spanCases) pplx[c.id] = merge((labels[c.id]?.spans ?? []).map(([a, b]) => [a, b] as PredSpan));
writeFileSync(join(HERE, "results/internal.pplx.json"), JSON.stringify({ engine: "pplx", dataset: "internal", measured: "2026-09-06", host: `${timing.summary.device} ${timing.summary.dtype} · torch ${timing.summary.torch}`, cases: spanCases.length, ms: { median: timing.summary.ms_median, p90: timing.summary.ms_p90, total: Math.round(Number(timing.summary.total_s) * 1000) }, preds: pplx }) + "\n");

// Presidio: values only in the committed artifact — located in the text like the vault is.
const pres = JSON.parse(readFileSync(join(HERE, "../presidio.detections.json"), "utf8")) as Record<string, string[]>;
const presidio: Record<string, PredSpan[]> = {};
for (const c of spanCases) presidio[c.id] = merge((pres[c.id] ?? []).flatMap((v) => occurrences(c.text, v)));
writeFileSync(join(HERE, "results/internal.presidio.json"), JSON.stringify({ engine: "presidio", dataset: "internal", measured: "2026-09-02", host: "presidio-analyzer 2.2.364 · spaCy 3.8.16 · en_core_web_lg 3.8.0 · language=en", cases: spanCases.length, ms: { median: 0, p90: 0, total: 0 }, preds: presidio }) + "\n");
console.log("wrote results/internal.pplx.json and results/internal.presidio.json");
