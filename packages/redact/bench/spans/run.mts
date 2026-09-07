#!/usr/bin/env tsx
/**
 * The public-benchmark comparison at span level — `pnpm bench:spans`.
 *
 *   pnpm bench:spans --replay --markdown               # THE page: every dataset, every column
 *                                                      # that results/ holds, nothing measured
 *   pnpm bench:spans                                   # measure patterns+ner on every dataset
 *   pnpm bench:spans --dataset gretel,tab              # some
 *   pnpm bench:spans --engines patterns                # no model needed
 *   pnpm bench:spans --extra pplx=results/tab.pplx.json   # a column from an explicit file
 *   pnpm bench:spans --markdown                        # the README tables
 *   pnpm bench:spans --limit 2000                      # the first N cases of the seeded sample only
 *   pnpm bench:spans --replay --json                   # results/scores.json, the SCORED summary
 *                                                      # every figure and table downstream reads
 *
 * Every engine run writes `results/<dataset>.<engine>.json` — the predicted spans per case,
 * the machine, the date and the per-case latency — so a number is a file first and a table
 * second, and anyone can re-score the file without the model. A column is scored on the
 * cases its file covers, and a table only ever compares columns on the cases they ALL cover
 * (`--limit` and a probe therefore never mix sample sizes inside one table).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadEngine, type EngineName } from "../engines";
import { f3, pc, scoreSpans, type PredSpan, type Scores, type SpanCase, type View } from "./metric";
import { vaultSpans } from "./predict";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const DATASETS = (opt("dataset") ?? readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".spancase.json")).map((f) => f.replace(".spancase.json", "")).sort().join(",")).split(",").filter(Boolean);
const REPLAY_ALL = argv.includes("--replay") && !opt("engines");
/** Measuring runs the two engines this repo owns. REPLAYING scores every column `results/`
 *  holds for the dataset — so ONE command rebuilds the whole page, including the columns
 *  produced by a Python sidecar (`pplx.py`) or converted from a committed artifact
 *  (`internal.mts`). Column order is fixed here so two runs are diffable. */
const ENGINES = (opt("engines") ?? "patterns,ner").split(",").filter(Boolean) as EngineName[];
const COLUMN_ORDER = ["patterns", "ner", "ner-strict", "pplx", "presidio"];
const EXTRA = (opt("extra") ?? "").split(",").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)] as const; });
const LIMIT = Number(opt("limit") ?? 0);
const REPLAY = argv.includes("--replay");
const MARKDOWN = argv.includes("--markdown");
/** Write the scored summary to `results/scores.json` — the ONE artifact anything downstream
 *  reads (`figures.py`, the READMEs). Nothing outside this file re-implements the metric:
 *  a second scorer is how two numbers for one measurement start to exist (rule 9). */
const JSON_OUT = argv.includes("--json");
const summary: Record<string, unknown>[] = [];

export interface ResultFile {
  engine: string; dataset: string; measured: string; host: string; cases: number; probe?: boolean;
  ms: { median: number; p90: number; total: number };
  preds: Record<string, PredSpan[]>;
}

/**
 * Every offset must lie inside its text — for the gold AND for what a result file predicts.
 * It fails LOUDLY because the one way to break it is invisible: re-deriving `data/` while a
 * `results/` file from the previous derivation is still on disk. Scoring the two together
 * read past the end of the text and printed `NaN %` in a table that otherwise looked fine.
 */
function assertInBounds(dataset: string, cases: readonly SpanCase[], engine: string, preds: Readonly<Record<string, PredSpan[]>>) {
  for (const c of cases) {
    for (const s of c.spans) if (!(Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.start < s.end && s.end <= c.text.length))
      throw new Error(`${dataset}/${c.id}: gold span ${s.start}–${s.end} (${s.label}) outside a ${c.text.length}-character text — re-run adapt.py`);
    for (const [a, b] of preds[c.id] ?? []) if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < b && b <= c.text.length))
      throw new Error(`${dataset}/${c.id}: ${engine} predicted ${a}–${b} outside a ${c.text.length}-character text — results/${dataset}.${engine}.json predates the current data/, re-measure it`);
  }
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const host = () => `${process.platform} ${process.arch} · ${cpus()[0]?.model ?? "?"} · ${Math.round(totalmem() / 2 ** 30)} GB · node ${process.version}`;

async function measure(name: EngineName, dataset: string, cases: SpanCase[]): Promise<ResultFile | null> {
  const engine = await loadEngine(name);
  if (!engine) return null;
  const preds: Record<string, PredSpan[]> = {}; const ms: number[] = [];
  let i = 0;
  for (const c of cases) {
    const t0 = performance.now();
    const vault = await engine(c.text);
    ms.push(performance.now() - t0);
    preds[c.id] = vaultSpans(c.text, vault);
    if (++i % 500 === 0) console.error(`  ${name}/${dataset}: ${i}/${cases.length} · median ${q(ms, 0.5).toFixed(0)} ms`);
  }
  return { engine: name, dataset, measured: new Date().toISOString().slice(0, 10), host: host(), cases: cases.length, ...(LIMIT ? { probe: true } : {}),
    ms: { median: +q(ms, 0.5).toFixed(1), p90: +q(ms, 0.9).toFixed(1), total: +ms.reduce((a, b) => a + b, 0).toFixed(0) }, preds };
}

const LABEL: Record<string, string> = { patterns: "openmasq `patterns`", ner: "**openmasq `ner`** (the product, Renforcé)", "ner-strict": "openmasq `ner` (Strict)", pplx: "PII-Tracer", presidio: "Presidio (default)" };
const name = (e: string) => LABEL[e] ?? e;

function render(dataset: string, cases: SpanCase[], cols: { engine: string; res: ResultFile; all: Scores; inn: Scores }[]) {
  const H = (s: string) => console.log(MARKDOWN ? `\n${s}\n` : `\n${s}`);
  const row = (cells: string[]) => console.log(MARKDOWN ? `| ${cells.join(" | ")} |` : cells.map((c, i) => (i ? c.padStart(22) : c.padEnd(26))).join(""));
  const sep = (n: number) => { if (MARKDOWN) console.log(`|---|${"---:|".repeat(n)}`); };
  const gold = cols[0].all.char.gold, goldIn = cols[0].inn.char.gold;
  H(`### ${dataset} — ${cases.length} cases · ${gold} annotated characters (${goldIn} in the product's scope)`);
  row(["metric", ...cols.map((c) => name(c.engine))]); sep(cols.length);
  const m = (f: (s: Scores) => number) => cols.map((c) => f3(f(c.all)));
  row(["character precision", ...m((s) => s.char.p)]);
  row(["character recall · all labels", ...m((s) => s.char.r)]);
  row(["**character F1 · all labels**", ...m((s) => s.char.f1).map((x) => (MARKDOWN ? `**${x}**` : x))]);
  row(["character recall · product scope", ...cols.map((c) => f3(c.inn.char.r))]);
  row(["character F1 · product scope", ...cols.map((c) => f3(c.inn.char.f1))]);
  row(["span-overlap F1", ...m((s) => s.overlap.f1)]);
  row(["span-containment F1", ...m((s) => s.containment.f1)]);
  row(["recurring identifiers, every mention found", ...cols.map((c) => pc(c.all.consistency.recurring[0], c.all.consistency.recurring[1]) + ` (${c.all.consistency.recurring[1]})`)]);
  // ⚠️ Measured DURING this accuracy pass, which runs engines side by side and for hours:
  // read it as an order of magnitude, not as a latency figure. `latency.mts` is the quiet
  // pass — one engine at a time, nothing else on the machine — and the README quotes THAT.
  row(["latency during this pass (ms/case)", ...cols.map((c) => `${c.res.ms.median} · ${c.res.ms.p90}`)]);
  const buckets = ["1", "2", "3–5", "6–10", "11+"].filter((b) => cols[0].all.consistency.buckets[b]);
  if (buckets.length > 1) {
    H(`Identifiers whose every mention is fully covered, by number of mentions (all labels):`);
    row(["mentions", ...cols.map((c) => name(c.engine))]); sep(cols.length);
    for (const b of buckets) row([`${b} (${cols[0].all.consistency.buckets[b][1]})`, ...cols.map((c) => { const e = c.all.consistency.buckets[b]; return pc(e[0], e[1]); })]);
  }
  const lens = Object.keys(cols[0].all.byLength).sort();
  if (lens.length > 1) {
    H(`Character P / R / F1 by text length (all labels):`);
    row(["length", ...cols.map((c) => name(c.engine))]); sep(cols.length);
    for (const l of lens) row([`${l} (${cases.filter((c) => (c.text.length < 1000 ? "<1k" : c.text.length < 10000 ? "1k–10k" : "≥10k") === l).length})`, ...cols.map((c) => { const e = c.all.byLength[l]; return `${f3(e.p)} / ${f3(e.r)} / ${f3(e.f1)}`; })]);
  }
  const langs = Object.keys(cols[0].all.byLang).sort((a, b) => cols[0].all.byLang[b].gold - cols[0].all.byLang[a].gold);
  if (langs.length > 1) {
    H(`Character F1 by language (all labels):`);
    row(["language", ...cols.map((c) => name(c.engine))]); sep(cols.length);
    for (const l of langs) row([`${l} (${cases.filter((c) => c.lang === l).length})`, ...cols.map((c) => f3(c.all.byLang[l].f1))]);
  }
  const labels = Object.entries(cols[0].all.byLabel).sort((a, b) => b[1].gold - a[1].gold);
  H(`Character recall by upstream label (spans · scope), all engines:`);
  row(["label", ...cols.map((c) => name(c.engine))]); sep(cols.length);
  // a label's scope as `adapt.py` assigned it (TAB mixes: the same type is `in` or `ctx` per mention)
  const scopeOf = (l: string) => { const n: Record<string, number> = {}; for (const c of cases) for (const s of c.spans) if (s.label === l) n[s.scope] = (n[s.scope] ?? 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k]) => k).join("/"); };
  for (const [l, e] of labels) row([`${l} (${e.spans} · ${scopeOf(l)})`, ...cols.map((c) => `${Math.round(100 * c.all.byLabel[l].charRecall)} %`)]);
}

for (const dataset of DATASETS) {
  let cases = JSON.parse(readFileSync(join(HERE, "data", `${dataset}.spancase.json`), "utf8")) as SpanCase[];
  if (LIMIT) cases = cases.slice(0, LIMIT);
  const loaded: { engine: string; res: ResultFile }[] = [];
  const engines: string[] = REPLAY_ALL
    ? readdirSync(join(HERE, "results")).map((f) => f.match(new RegExp(`^${dataset}\\.(.+)\\.json$`))?.[1]).filter((e): e is string => !!e)
        .sort((a, b) => (COLUMN_ORDER.indexOf(a) + 1 || 99) - (COLUMN_ORDER.indexOf(b) + 1 || 99))
    : ENGINES;
  for (const engine of engines) {
    const file = join(HERE, "results", `${dataset}.${engine}.json`);
    let res: ResultFile | null = null;
    if (REPLAY) { if (existsSync(file)) res = JSON.parse(readFileSync(file, "utf8")); else console.error(`! no ${file}`); }
    else { res = await measure(engine as EngineName, dataset, cases); if (res) writeFileSync(file, JSON.stringify(res) + "\n"); }
    if (res) loaded.push({ engine, res });
  }
  for (const [engine, file] of EXTRA) {
    const path = file.startsWith("/") ? file : existsSync(join(process.cwd(), file)) ? join(process.cwd(), file) : join(HERE, file);
    const f = path.replace("<dataset>", dataset);
    if (!existsSync(f)) { console.error(`! ${engine}: no ${f}`); continue; }
    const res = JSON.parse(readFileSync(f, "utf8")) as ResultFile;
    if (res.dataset && res.dataset !== dataset) continue;
    loaded.push({ engine, res });
  }
  if (!loaded.length) continue;
  // one table = one set of cases: those every column covers
  const common = cases.filter((c) => loaded.every((l) => c.id in l.res.preds));
  if (common.length !== cases.length) console.error(`! ${dataset}: ${common.length}/${cases.length} cases covered by every column (${loaded.map((l) => `${l.engine} ${Object.keys(l.res.preds).length}`).join(", ")})`);
  for (const { engine, res } of loaded) assertInBounds(dataset, common, engine, res.preds);
  const cols = loaded.map(({ engine, res }) => ({ engine, res, all: scoreSpans(common, res.preds, "all" as View), inn: scoreSpans(common, res.preds, "in" as View) }));
  if (JSON_OUT) {
    for (const c of cols) {
      const bucketed = (b: Scores["consistency"]["buckets"]) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ok: v[0], n: v[1] }]));
      summary.push({
        dataset, engine: c.engine, cases: common.length, measured: c.res.measured, host: c.res.host,
        all: { p: c.all.char.p, r: c.all.char.r, f1: c.all.char.f1, goldChars: c.all.char.gold, predChars: c.all.char.pred },
        in: { p: c.inn.char.p, r: c.inn.char.r, f1: c.inn.char.f1, goldChars: c.inn.char.gold },
        spanOverlapF1: c.all.overlap.f1, spanContainmentF1: c.all.containment.f1,
        consistency: { recurring: { ok: c.all.consistency.recurring[0], n: c.all.consistency.recurring[1] }, buckets: bucketed(c.all.consistency.buckets) },
        byLength: Object.fromEntries(Object.entries(c.all.byLength).map(([k, v]) => [k, { p: v.p, r: v.r, f1: v.f1, goldChars: v.gold }])),
        byLang: Object.fromEntries(Object.entries(c.all.byLang).map(([k, v]) => [k, { f1: v.f1, goldChars: v.gold }])),
        byLabel: Object.fromEntries(Object.entries(c.all.byLabel).map(([k, v]) => [k, { charRecall: v.charRecall, spans: v.spans, contained: v.contained, goldChars: v.gold }])),
        ms: c.res.ms,
      });
    }
  }
  render(dataset, common, cols);
}
if (JSON_OUT) {
  writeFileSync(join(HERE, "results", "scores.json"), JSON.stringify({
    measured: new Date().toISOString().slice(0, 10),
    scorer: "spans/metric.ts",
    rows: summary,
  }, null, 1) + "\n");
  console.error(`\n→ results/scores.json — ${summary.length} colonnes scorées`);
}
