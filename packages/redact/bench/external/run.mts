#!/usr/bin/env tsx
/**
 * The away-game bench: our engine scored on PRESIDIO'S OWN evaluation corpus, and
 * Presidio scored on the same cases through the SAME metric (`../metric.ts`). Every
 * number in README.md comes out of this file — re-run it before quoting one.
 *
 *   pnpm tsx packages/redact/bench/external/run.mts                # patterns (no NER)
 *   pnpm tsx packages/redact/bench/external/run.mts --ner          # the product config
 *   pnpm tsx packages/redact/bench/external/run.mts --detections presidio.detections.json
 *
 * `--ner` needs the bundled local model (`pnpm build` bakes it into
 * apps/desktop/build/ner-models, sha256-verified — same artifact the desktop ships).
 * The third form scores ANY engine's precomputed detections ({caseId: [values]}),
 * which is how the committed Presidio column stays replayable without a Python env.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { coversTruth, pct, scoreCorpus, type BenchCase } from "../metric";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const detFileIdx = argv.indexOf("--detections");
const detFile = detFileIdx >= 0 ? argv[detFileIdx + 1] : null;
const useNer = argv.includes("--ner");

const cases = JSON.parse(
  readFileSync(join(HERE, "presidio-research.benchcase.json"), "utf8"),
) as BenchCase[];

let detect: (text: string, id: string) => Promise<string[]>;
let label: string;
if (detFile) {
  const dets = JSON.parse(readFileSync(join(HERE, detFile), "utf8")) as Record<string, string[]>;
  detect = async (_t, id) => dets[id] ?? [];
  label = `precomputed detections (${detFile})`;
} else {
  const { pseudonymize } = await import("../../src/index");
  let detectLocal: ((text: string) => Promise<unknown>) | undefined;
  if (useNer) {
    const MODELS = join(HERE, "../../../../apps/desktop/build/ner-models");
    if (!existsSync(join(MODELS, "openmasq/bert-base-multilingual-cased-ner-hrl/config.json"))) {
      console.error(`! local NER model missing under ${MODELS} — run \`pnpm build\` first`);
      process.exit(2);
    }
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = true;
    tf.env.localModelPath = MODELS;
    const pipe = await tf.pipeline("token-classification", "openmasq/bert-base-multilingual-cased-ner-hrl", { dtype: "q8" });
    const { createNerPredict } = await import("../../src/local/ner");
    const { detectLocalNer } = await import("../../src/local/detect");
    const predict = await createNerPredict({ pipeline: (t: string, o?: unknown) => pipe(t, o), modelKey: "multilingual" });
    detectLocal = (text: string) => detectLocalNer(text, predict, { chunkSize: 1000 });
  }
  detect = async (text) => {
    const vault: Record<string, string> = {};
    await pseudonymize(text, { vault, ...(detectLocal ? { detectLocal } : {}) });
    return Object.values(vault).map((v) => v.replace(/\\/g, "/"));
  };
  label = useNer ? "openmasq `ner` (the product: deterministic + local NER)" : "openmasq `patterns` (deterministic, no NER)";
}

const detById = new Map<string, string[]>();
for (const c of cases) detById.set(c.id, await detect(c.text, c.id));
const s = await scoreCorpus(cases, async (text) => {
  const c = cases.find((x) => x.text === text);
  return c ? detById.get(c.id)! : [];
});

const byCat = new Map<string, { ok: number; n: number }>();
for (const c of cases) {
  const detected = detById.get(c.id)!;
  for (const [v, cat] of c.truth) {
    const e = byCat.get(cat) ?? { ok: 0, n: 0 };
    e.n++;
    if (coversTruth(v, detected)) e.ok++;
    byCat.set(cat, e);
  }
}

console.log(`\n=== ${label} · ${cases.length} cases ===\n`);
console.log("category   found/total   recall");
for (const [cat, e] of [...byCat].sort((a, b) => b[1].n - a[1].n))
  console.log(`  ${cat.padEnd(8)} ${String(e.ok).padStart(6)}/${String(e.n).padEnd(6)} ${String(pct(e.ok, e.n)).padStart(4)} %`);
console.log(`\n  GLOBAL  ${s.found}/${s.total} (${pct(s.found, s.total)} %) · false positives ${s.fp}`);
