#!/usr/bin/env tsx
/**
 * Latency, measured QUIETLY and LIKE FOR LIKE — `pnpm exec tsx packages/redact/bench/spans/latency.mts [n]`.
 *
 * ⚠️ The per-case timings inside `results/<dataset>.<engine>.json` are NOT a latency
 * measurement and must never be charted as one. They are taken during the accuracy passes,
 * which run for hours and run engines side by side on one laptop, so they carry the
 * contention of whatever else was measuring at that moment.
 *
 * And a second confound, the one that actually matters: the columns do not share a machine
 * path. Three things differ at once between the product and PII-Tracer —
 *
 *   | column      | runtime                     | device      | numeric type |
 *   |-------------|-----------------------------|-------------|--------------|
 *   | patterns    | node, pure JS               | CPU         | —            |
 *   | ner         | onnxruntime-node            | CPU         | int8 (q8)    |
 *   | PII-Tracer  | python + torch              | MPS (GPU)   | bfloat16     |
 *
 * — so a bar chart of those three answers no question anyone has. This pass fixes what it
 * can: ONE engine at a time, nothing else running, the SAME documents, a warm-up case
 * excluded. The device stays a property of the engine (that is what each one ships as), so
 * it is RECORDED per row and must be printed beside every figure; `pplx.py <dataset> <n>
 * --latency --device cpu` measures PII-Tracer on the CPU so a same-device comparison exists.
 *
 * Writes `results/latency.node.json` next to the Python side's `latency.pplx.<device>.json`.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadEngine, type EngineName } from "../engines";
import type { SpanCase } from "./metric";

const HERE = dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] ?? 200);
const datasets = readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".spancase.json")).map((f) => f.replace(".spancase.json", "")).sort();
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const host = `${process.platform} ${process.arch} · ${cpus()[0]?.model} · ${Math.round(totalmem() / 2 ** 30)} GB · node ${process.version}`;

/** What each engine actually runs on — printed with every figure, never assumed. */
const DEVICE: Record<string, { device: string; runtime: string; numeric: string }> = {
  patterns: { device: "CPU", runtime: "node (JS)", numeric: "—" },
  ner: { device: "CPU", runtime: "onnxruntime-node", numeric: "int8" },
  "ner-strict": { device: "CPU", runtime: "onnxruntime-node", numeric: "int8" },
};

const rows: Record<string, unknown>[] = [];
console.log(`${host} · first ${N} cases per dataset, one warm-up excluded\n`);
console.log(`| dataset | cases · median chars | engine | device | median ms | p90 ms | chars/s |`);
console.log(`|---|---:|---|---|---:|---:|---:|`);
for (const name of ["patterns", "ner", "ner-strict"] as EngineName[]) {
  const engine = await loadEngine(name);
  if (!engine) continue;
  for (const d of datasets) {
    const cases = (JSON.parse(readFileSync(join(HERE, "data", `${d}.spancase.json`), "utf8")) as SpanCase[]).slice(0, N + 1);
    const ms: number[] = []; let chars = 0;
    for (const [i, c] of cases.entries()) {
      const t0 = performance.now(); await engine(c.text); const dt = performance.now() - t0;
      if (i === 0) continue; ms.push(dt); chars += c.text.length;
    }
    const lens = cases.slice(1).map((c) => c.text.length);
    const total = ms.reduce((a, b) => a + b, 0);
    const row = {
      dataset: d, engine: name, ...DEVICE[name], cases: ms.length, medianChars: q(lens, 0.5),
      median: +q(ms, 0.5).toFixed(1), p90: +q(ms, 0.9).toFixed(1), charsPerSec: Math.round((1000 * chars) / total),
    };
    rows.push(row);
    console.log(`| ${d} | ${row.cases} · ${row.medianChars} | ${name} | ${row.device} | ${row.median} | ${row.p90} | ${row.charsPerSec} |`);
  }
}
writeFileSync(join(HERE, "results", "latency.node.json"), JSON.stringify({ host, sample: N, measured: new Date().toISOString().slice(0, 10), rows }, null, 1) + "\n");
