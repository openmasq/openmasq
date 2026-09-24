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
 * ⚠️ THE INFERENCE CACHE IS FORCED OFF HERE, from inside the file, and that is not a
 * preference. `engines.ts` wraps the model in `nerCache.ts` so the ACCURACY passes do not
 * pay for the same inference twice — entirely right for them, and fatal here: run without
 * it and the `ner` rows report a disk lookup as if it were the model. Measured on this
 * laptop before the fix, `ner` on TAB read 117.6 ms median with `624 hit(s), 0 miss(es)` —
 * a number that describes the rules plus a hash, and nothing about the weights at all.
 * There is no configuration of a LATENCY bench in which a cache is the right answer, so
 * the switch is not left to the caller.
 *
 * ITERATION LOOP. The default is deliberately small — one pass over two datasets — because
 * a measurement nobody runs is a measurement that does not exist:
 *
 *   pnpm bench:latency                  # the loop: ~20 cases, both layers, cache off
 *   pnpm bench:latency --full           # 200 cases over every dataset, for a published figure
 *   pnpm bench:latency --save           # freeze THIS machine's numbers as the baseline
 *
 * A baseline is machine-local (gitignored, like the inference cache) because a millisecond
 * on an M1 is not a millisecond on a CI runner, and a committed absolute would be wrong for
 * everyone but its author. With one present, every row prints its drift; that is the part
 * meant to run beside `pnpm test:redact`.
 *
 * ⚠️ TWO THINGS MAKE THAT DRIFT MEAN ANYTHING, and the first version of this file had
 * neither — it reported +69 %, -24 %, +38 % on an UNCHANGED tree, which is how a developer
 * learns to ignore the column:
 *   · a comparison is refused unless the sample MATCHES (same n, same reps). Different n is
 *     different documents doing different work; the percentage was arithmetic on two
 *     unrelated numbers.
 *   · every row is NORMALISED by a calibration workload measured in the same run. Two
 *     consecutive runs of an unchanged tree drifted +8 %, +15 %, +10 %, +20 %, +25 %, +36 %
 *     — six rows, six POSITIVE, which is not noise but the machine: this laptop has no fan,
 *     so the second run is simply hotter than the first and the clock is lower. An absolute
 *     millisecond cannot survive that, and a threshold set against it would fire on the
 *     weather. A fixed pure-CPU workload timed beside the engines moves the same way, so
 *     dividing by it cancels the thermal state and leaves the engine's own cost.
 *   · each case is timed `--reps` times and the MINIMUM is kept. The minimum is the run that
 *     lost the least time to the scheduler, the page cache and whatever else the laptop was
 *     doing; a median over noisy repeats keeps the noise, a minimum discards it. This is the
 *     standard estimator for latency and it is what makes two consecutive runs agree.
 *
 * ⚠️ Only `--full` writes `results/latency.node.json`, the PUBLISHED figure that sits next to
 * the Python side's `latency.pplx.<device>.json`. A loop run is twenty cases on two datasets
 * and has no business overwriting a two-hundred-case measurement — which it did, once, and
 * the diff was 140 lines of a published result replaced by a smoke test.
 */
// BEFORE the engines are imported: `openNerCache` reads this at module load.
process.env.OPENMASQ_BENCH_NER_CACHE = "0";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadEngine, type EngineName } from "../engines";
import type { SpanCase } from "./metric";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const FULL = ARGV.includes("--full");
const SAVE = ARGV.includes("--save");
const N = Number(ARGV.find((a) => /^\d+$/.test(a)) ?? (FULL ? 200 : 20));
/** A flag's value, and only when the flag is actually there. Reading `ARGV[indexOf + 1]`
 *  reads ARGV[0] when the flag is ABSENT — which made `--save` set reps to NaN, so the
 *  repeat loop never ran, every median came out `Infinity`, and the baseline was written
 *  full of nulls without a word of complaint. */
const opt = (name: string): string | undefined => {
  const i = ARGV.indexOf(`--${name}`);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const REPS = Number(opt("reps") ?? (FULL ? 1 : 3));
if (!Number.isFinite(REPS) || REPS < 1) throw new Error(`--reps invalide : ${opt("reps")}`);
const all = readdirSync(join(HERE, "data"))
  .filter((f) => f.endsWith(".spancase.json"))
  .map((f) => f.replace(".spancase.json", ""))
  .sort();
// The loop pair: the shortest cases and a middling one, so both the fixed cost per call and
// the per-character cost move visibly. `--full` is what a published figure is taken from.
const datasets = FULL ? all : all.filter((d) => d === "internal" || d === "ai4privacy");
const BASE_FILE = join(HERE, "results", ".latency.baseline.json");
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const host = `${process.platform} ${process.arch} · ${cpus()[0]?.model} · ${Math.round(totalmem() / 2 ** 30)} GB · node ${process.version}`;

/** What each engine actually runs on — printed with every figure, never assumed. */
const DEVICE: Record<string, { device: string; runtime: string; numeric: string }> = {
  patterns: { device: "CPU", runtime: "node (JS)", numeric: "—" },
  ner: { device: "CPU", runtime: "onnxruntime-node", numeric: "int8" },
  "ner-strict": { device: "CPU", runtime: "onnxruntime-node", numeric: "int8" },
};

/**
 * A fixed workload with no I/O and no allocation surprises, timed in the same conditions as
 * the engines. Its absolute value means nothing; its RATIO to the same figure in another run
 * is how much slower this machine is right now, which is exactly what has to be divided out.
 */
function calibrate(): number {
  const probe = "Marie Dupont 06 12 34 56 78 FR76 3000 6000 0112 3456 7890 189 ".repeat(40);
  const re = /\b[A-Z][a-z]+\b|\d{2,}/g;
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 7; k++) {
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 200; i++) {
      re.lastIndex = 0;
      while (re.exec(probe)) n++;
    }
    if (!n) throw new Error("calibration vide");
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

type Baseline = {
  host: string;
  n: number;
  reps: number;
  calib: number;
  rows: Record<string, number>;
};
let base: Baseline | undefined;
try {
  const b = JSON.parse(readFileSync(BASE_FILE, "utf8")) as Baseline;
  if (b.host !== host) console.log(`(baseline ignorée : prise sur ${b.host})`);
  else if (b.n !== N || b.reps !== REPS)
    console.log(
      `(baseline ignorée : prise à n=${b.n} reps=${b.reps}, ce run est n=${N} reps=${REPS})`,
    );
  else base = b;
} catch {}

const calib = calibrate();
const scale = base ? calib / base.calib : 1; // >1 = this run is on a slower/hotter machine
const rows: Record<string, unknown>[] = [];
console.log(
  `${host}\n${N} cases per dataset × ${REPS} rep(s), min kept, one warm-up excluded, INFERENCE CACHE OFF`,
);
console.log(
  `calibration ${calib.toFixed(2)} ms${base ? ` · cette machine tourne à ${(100 / scale).toFixed(0)} % de la référence` : ""}\n`,
);
console.log(
  `| dataset | cases · median chars | engine | device | median ms | p90 ms | chars/s | vs base |`,
);
console.log(`|---|---:|---|---|---:|---:|---:|---:|`);
for (const name of ["patterns", "ner", "ner-strict"] as EngineName[]) {
  const engine = await loadEngine(name);
  if (!engine) continue;
  for (const d of datasets) {
    const cases = (
      JSON.parse(readFileSync(join(HERE, "data", `${d}.spancase.json`), "utf8")) as SpanCase[]
    ).slice(0, N + 1);
    const ms: number[] = [];
    let chars = 0;
    for (const [i, c] of cases.entries()) {
      // The MINIMUM over the repeats, not the mean: every millisecond above the floor is
      // something else on the machine, never the engine getting slower at its own job.
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < REPS; k++) {
        const t0 = performance.now();
        await engine(c.text);
        best = Math.min(best, performance.now() - t0);
      }
      if (i === 0) continue;
      ms.push(best);
      chars += c.text.length;
    }
    const lens = cases.slice(1).map((c) => c.text.length);
    const total = ms.reduce((a, b) => a + b, 0);
    const row = {
      dataset: d,
      engine: name,
      ...DEVICE[name],
      cases: ms.length,
      medianChars: q(lens, 0.5),
      median: +q(ms, 0.5).toFixed(1),
      p90: +q(ms, 0.9).toFixed(1),
      charsPerSec: Math.round((1000 * chars) / total),
    };
    rows.push(row);
    const key = `${d}/${name}`;
    // The baseline scaled to THIS run's machine state, so the comparison is engine-to-engine
    // and not laptop-to-laptop.
    const was = base ? base.rows[key] * scale : undefined;
    // 20 %, MEASURED rather than chosen — and worth knowing what it does NOT buy. Two runs of
    // an unchanged tree land within ±13 % on a rested machine, but ±25 % after several runs
    // back to back, because normalising removes the systematic drift and not the variance.
    // So this column catches a regression that is a MULTIPLE — a new rule family, a chunking
    // change, a cache lost — and it will never resolve ten percent. Read it that way.
    // It states the drift and never fails the run: a latency gate that cries wolf gets muted,
    // and a muted gate is worse than none.
    const drift = was
      ? `${row.median > was ? "+" : ""}${(((row.median - was) / was) * 100).toFixed(0)}%${Math.abs(row.median - was) / was > 0.2 ? " ⚠" : ""}`
      : "—";
    console.log(
      `| ${d} | ${row.cases} · ${row.medianChars} | ${name} | ${row.device} | ${row.median} | ${row.p90} | ${row.charsPerSec} | ${drift} |`,
    );
  }
}
if (FULL)
  writeFileSync(
    join(HERE, "results", "latency.node.json"),
    JSON.stringify(
      { host, sample: N, measured: new Date().toISOString().slice(0, 10), rows },
      null,
      1,
    ) + "\n",
  );
if (SAVE) {
  const snap: Baseline = { host, n: N, reps: REPS, calib, rows: {} };
  for (const r of rows) snap.rows[`${r.dataset}/${r.engine}`] = r.median as number;
  // A baseline is only useful if it is TRUE. JSON turns Infinity and NaN into null, so a
  // broken run would otherwise persist silently and every later comparison would be against
  // nothing — which is exactly what happened once.
  const bad = Object.entries(snap.rows).filter(([, v]) => !Number.isFinite(v));
  if (bad.length)
    throw new Error(`mesures non finies, baseline NON écrite : ${bad.map(([k]) => k).join(", ")}`);
  writeFileSync(BASE_FILE, JSON.stringify(snap, null, 1) + "\n");
  console.log(`\nbaseline écrite (${Object.keys(snap.rows).length} lignes) — ${BASE_FILE}`);
} else if (!base) {
  console.log(
    `\n(pas de baseline pour cette machine — \`pnpm bench:latency --save\` pour la figer)`,
  );
}
