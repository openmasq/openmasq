#!/usr/bin/env tsx
/**
 * The detection comparison — `pnpm bench:compare`. Every number the README quotes for
 * the engine against Presidio comes out of this file; re-run it before quoting one.
 *
 * Two corpora, three engines, ONE scorer (`./metric.ts`):
 *   internal  — `corpora/*.json`, our 18 document families, 14 languages, real layouts.
 *   external  — `external/presidio-research.benchcase.json`, Presidio's own evaluation set.
 *   patterns  — the deterministic pipeline alone (no model).
 *   ner       — the product: deterministic + the bundled local NER (needs `pnpm build`).
 *   presidio  — Presidio's default AnalyzerEngine, replayed from COMMITTED detections
 *               (`presidio.py` produces them; no Python needed to replay).
 *
 *   pnpm bench:compare                         # both corpora, all three engines
 *   pnpm bench:compare --corpus internal       # one corpus
 *   pnpm bench:compare --engines patterns,presidio   # skip the NER (no model built)
 *   pnpm bench:compare --markdown              # the README tables, verbatim
 *
 * `CONTEXT` is the out-of-scope annotation (`metric.ts` RECALL_EXEMPT): kept out of the
 * recall denominator, kept INSIDE the false-positive test — an engine is never charged
 * for finding a real datum we chose not to score.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./engines";
import { coversTruth, pct, scoreCorpus, type BenchCase } from "./metric";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const CORPORA = (opt("corpus") ?? "internal,external").split(",") as ("internal" | "external")[];
const ENGINES = (opt("engines") ?? "patterns,ner,presidio").split(",") as ("patterns" | "ner" | "ner-strict" | "presidio")[];
const MARKDOWN = argv.includes("--markdown");
/** Extra columns from committed detection files: `--extra pplx=bench/pplx.detections.json[,name=file…]`.
 *  Same shape as Presidio's (`{ caseId: [detected values] }`), so any engine with a sidecar
 *  that writes that file gets a column, scored by the same metric. */
const EXTRA: [string, string][] = (opt("extra") ?? "").split(",").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; });

type Detect = (text: string, id: string) => Promise<string[]>;

/** Presidio's detections are a committed artifact per corpus — the fixed yardstick. */
const PRESIDIO_FILE = { internal: join(HERE, "presidio.detections.json"), external: join(HERE, "external/presidio.detections.json") };

function loadCorpus(which: "internal" | "external"): BenchCase[] {
  if (which === "external") return JSON.parse(readFileSync(join(HERE, "external/presidio-research.benchcase.json"), "utf8"));
  const dir = join(HERE, "corpora");
  // `tokensVsFakes.json` is a different kind of bench (no `truth`); it is not a corpus here.
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as Partial<BenchCase>[]).filter((c) => Array.isArray(c.truth)) as BenchCase[]);
}

async function engine(name: "patterns" | "ner" | "ner-strict" | "presidio", which: "internal" | "external"): Promise<Detect | null> {
  if (name === "presidio") {
    if (!existsSync(PRESIDIO_FILE[which])) { console.error(`! no Presidio detections for ${which} — run bench/presidio.py ${which}`); return null; }
    const dets = JSON.parse(readFileSync(PRESIDIO_FILE[which], "utf8")) as Record<string, string[]>;
    return async (_t, id) => dets[id] ?? [];
  }
  // `engines.ts` — the same loader `spans/run.mts` uses; BARE policy here (see its header).
  const run = await loadEngine(name, "bare");
  if (!run) return null;
  return async (text: string) => Object.values(await run(text)).map((v) => v.replace(/\\/g, "/"));
}

interface Column { name: string; byCat: Map<string, [ok: number, n: number]>; unscored: [number, number]; found: number; total: number; fp: number; byLang: Record<string, [number, number]> }

async function score(name: string, cases: BenchCase[], detect: Detect): Promise<Column> {
  const byId = new Map<string, string[]>();
  for (const c of cases) byId.set(c.id, await detect(c.text, c.id));
  const byText = new Map(cases.map((c) => [c.text, byId.get(c.id)!]));
  const s = await scoreCorpus(cases, async (text) => byText.get(text) ?? []);
  const byCat = new Map<string, [number, number]>(); const unscored: [number, number] = [0, 0];
  for (const c of cases) for (const [v, cat] of c.truth) {
    const e = cat === "CONTEXT" ? unscored : (byCat.get(cat) ?? [0, 0]);
    e[1]++; if (coversTruth(v, byId.get(c.id)!)) e[0]++;
    if (cat !== "CONTEXT") byCat.set(cat, e);
  }
  return { name, byCat, unscored, found: s.found, total: s.total, fp: s.fp, byLang: s.byLang };
}

const LABEL = { patterns: "openmasq `patterns`", ner: "**openmasq `ner`** (the product)", presidio: "Presidio (default)" } as const;

function render(which: string, cases: BenchCase[], cols: Column[]) {
  const cats = [...new Map(cases.flatMap((c) => c.truth).filter(([, k]) => k !== "CONTEXT").map(([, k]) => [k, 0])).keys()]
    .sort((a, b) => (cols[0].byCat.get(b)?.[1] ?? 0) - (cols[0].byCat.get(a)?.[1] ?? 0));
  const langs = Object.keys(cols[0].byLang).sort((a, b) => cols[0].byLang[b][1] - cols[0].byLang[a][1]);
  const cell = (c: Column, cat: string) => { const e = c.byCat.get(cat); return e ? `${pct(e[0], e[1])} %` : "—"; };
  if (MARKDOWN) {
    console.log(`\n### ${which} — ${cases.length} cases, ${cols[0].total} scored truths\n`);
    console.log(`| category | truths | ${cols.map((c) => LABEL[c.name as keyof typeof LABEL] ?? c.name).join(" | ")} |`);
    console.log(`|---|---:|${cols.map(() => "---:").join("|")}|`);
    for (const cat of cats) console.log(`| ${cat} | ${cols[0].byCat.get(cat)?.[1]} | ${cols.map((c) => cell(c, cat)).join(" | ")} |`);
    console.log(`| **GLOBAL** | ${cols[0].total} | ${cols.map((c) => `**${pct(c.found, c.total)} %** · ${c.fp} FP`).join(" | ")} |`);
    if (langs.length > 1) {
      console.log(`\n| language | cases | ${cols.map((c) => LABEL[c.name as keyof typeof LABEL] ?? c.name).join(" | ")} |`);
      console.log(`|---|---:|${cols.map(() => "---:").join("|")}|`);
      for (const l of langs) console.log(`| ${l} | ${cases.filter((c) => c.lang === l).length} | ${cols.map((c) => `${pct(c.byLang[l]?.[0] ?? 0, c.byLang[l]?.[1] ?? 0)} %`).join(" | ")} |`);
    }
    console.log(`\nOut of scope, not in the global (titles, ages, nationalities, dates…): ${cols[0].unscored[1]} annotations.`);
    return;
  }
  console.log(`\n=== ${which} · ${cases.length} cases · ${cols[0].total} scored truths ===\n`);
  console.log(`  ${"category".padEnd(12)} ${"truths".padStart(6)}  ${cols.map((c) => c.name.padStart(10)).join("  ")}`);
  for (const cat of cats) console.log(`  ${cat.padEnd(12)} ${String(cols[0].byCat.get(cat)?.[1]).padStart(6)}  ${cols.map((c) => cell(c, cat).padStart(10)).join("  ")}`);
  console.log(`  ${"GLOBAL".padEnd(12)} ${String(cols[0].total).padStart(6)}  ${cols.map((c) => `${pct(c.found, c.total)} %`.padStart(10)).join("  ")}`);
  console.log(`  ${"false pos.".padEnd(12)} ${"".padStart(6)}  ${cols.map((c) => String(c.fp).padStart(10)).join("  ")}`);
  if (langs.length > 1) for (const l of langs)
    console.log(`  ${("lang " + l).padEnd(12)} ${String(cases.filter((c) => c.lang === l).length).padStart(6)}  ${cols.map((c) => `${pct(c.byLang[l]?.[0] ?? 0, c.byLang[l]?.[1] ?? 0)} %`.padStart(10)).join("  ")}`);
  console.log(`  (out of scope, not counted: ${cols[0].unscored[1]} annotations)`);
}

for (const which of CORPORA) {
  const cases = loadCorpus(which);
  const cols: Column[] = [];
  for (const name of ENGINES) {
    const detect = await engine(name, which);
    if (detect) cols.push(await score(name, cases, detect));
  }
  for (const [name, file] of EXTRA) {
    const path = file.startsWith("/") ? file : join(process.cwd(), file);
    if (!existsSync(path)) { console.error(`! no detections file for ${name}: ${path}`); continue; }
    const dets = JSON.parse(readFileSync(path, "utf8")) as Record<string, string[]>;
    cols.push(await score(name, cases, async (_t, id) => dets[id] ?? []));
  }
  if (cols.length) render(which, cases, cols);
}
