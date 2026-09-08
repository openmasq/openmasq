/**
 * The engines every bench loads — ONE home (rule 9), so `compare.mts` (values) and
 * `spans/run.mts` (offsets) measure exactly the same pipeline.
 *
 *   patterns   — the deterministic pipeline alone (`pseudonymize` with no model).
 *   ner        — the product: deterministic + the bundled local NER, q8 on CPU through
 *                @huggingface/transformers, the same weights the desktop app ships
 *                (needs `pnpm build`, which bakes and sha256-pins them). Its INFERENCE is
 *                cached per chunk of text (`nerCache.ts`) — the two policies below share one
 *                model pass, and a rules-only change replays at the rules' speed.
 *                `OPENMASQ_BENCH_NER_CACHE=0` re-measures the model itself.
 *   ner-strict — the same, at the STRICT level.
 *
 * Three POLICIES, and which bench uses which is the whole meaning of its numbers:
 *   bare      — `pseudonymize` with no options: every category on except the opt-in `date`,
 *               brands and public figures redacted. The value bench (`compare.mts`) — the
 *               engine's regression floor, comparable to every figure it ever published.
 *   renforce  — the product's DEFAULT level: the opt-in categories off (`url`, `username`,
 *               `date`), notorious brands and public figures spared. The span bench's
 *               product column: what a user gets out of the box.
 *   strict    — every category on, nothing spared. The span bench's second product column.
 * The two levels are the app's own rules (`@openmasq/catalog` `categoriesForLevel`,
 * `@openmasq/ui` `notorietyForLevel`), read from the catalog rather than restated here —
 * through a RELATIVE path, because this package must not depend on the catalog (the
 * dependency runs catalog → redact); the catalog reads the engine's `dist/`, so rebuild it
 * (`pnpm --filter @openmasq/redact build`) before measuring.
 */
import type { RawNerEntity } from "../src/local/nerRuns";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETIRED_CATEGORIES } from "../../catalog/src/redaction";
import { categoriesForLevel, disabledKindsOf } from "../../catalog/src/redaction/levels";
import { openNerCache } from "./nerCache";
import type { NerPredict } from "../src/local/ner";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The weights the desktop ships, in the quantisation it ships them in — the cache's key. */
const MODEL = "openmasq/bert-base-multilingual-cased-ner-hrl";
const DTYPE = "q8";
export type EngineName = "patterns" | "ner" | "ner-strict";
export type Policy = "bare" | "renforce" | "strict";
/** Runs the pipeline on one text; returns the vault (token → real value) it filled. */
export type Engine = (text: string) => Promise<Record<string, string>>;

/** The policy's engine options — for a level, the same derivation the app performs on every send. */
export function policyOptions(policy: Policy) {
  if (policy === "bare") return {};
  const strict = policy === "strict";
  // The RETIRED categories are forced OFF, LAST — exactly as the app's own send merge does
  // (`packages/ui/src/send/redactionOptions.ts` `effectiveRedactCategories`, where retired
  // outranks even an org policy). Without this the product columns redact the `health` values
  // a shipped app leaves in clear, and the bench credits us with a promise the product
  // dropped. `bare` keeps its historical meaning (no options at all) — it is the value
  // bench's regression floor, not a level a user can select.
  const categories = categoriesForLevel(policy);
  for (const key of RETIRED_CATEGORIES) categories[key] = false;
  return {
    disabledKinds: disabledKindsOf(categories),
    commercialNotoriety: !strict,
    peopleNotoriety: !strict,
  };
}

/**
 * The model, loaded ONCE per process — and the cache with it.
 *
 * ⚠️ `loadEngine` is called per (corpus, engine) pair: a full pass asks for it ten times with
 * the NER. Each call used to open its OWN onnxruntime session — ten copies of the same 180 MB
 * of weights, none of them released, plus ten reads of the growing cache file. The full pass
 * was killed for want of memory. One session, one cache, one exit report.
 */
let shared: Promise<NerPredict | null> | null = null;
function sharedPredict(): Promise<NerPredict | null> {
  shared ??= (async () => {
    const MODELS = join(HERE, "../../../apps/desktop/build/ner-models");
    if (!existsSync(join(MODELS, `${MODEL}/config.json`))) {
      console.error(`! local NER model missing under ${MODELS} — run \`pnpm build\` first`);
      return null;
    }
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = true; tf.env.localModelPath = MODELS;
    const pipe = await tf.pipeline("token-classification", MODEL, { dtype: DTYPE });
    // The two product columns run the SAME inference over the SAME text — only the policy
    // differs, and it applies after detection — and a rules-only change re-runs it for
    // nothing. `nerCache.ts` serves the model's raw output from disk; everything downstream
    // of it still executes.
    const cache = openNerCache(join(HERE, ".cache/ner.ndjson"), `${MODEL}|${DTYPE}|aggregation=none`);
    process.on("exit", () => { const r = cache.report(); if (r) console.error(r); });
    const cached = cache.wrap(async (t: string, o?: Record<string, unknown>) => pipe(t, o as Parameters<typeof pipe>[1]));
    const { createNerPredict } = await import("../src/local/ner");
    return createNerPredict({
      // `nerCache` is payload-agnostic on purpose — it JSON round-trips whatever the model
      // returned, so its `unknown` IS the pipeline's own output coming back off disk. This
      // is the one boundary where the typed contract resumes, so it says so here rather
      // than loosening `NerPipeline` for everyone.
      pipeline: async (t: string, o?: unknown) =>
        (await cached(t, o as Record<string, unknown>)) as RawNerEntity[] | RawNerEntity[][],
      modelKey: "multilingual",
    });
  })();
  return shared;
}

export async function loadEngine(name: EngineName, policy: Policy = name === "ner-strict" ? "strict" : "renforce"): Promise<Engine | null> {
  const { pseudonymize } = await import("../src/index");
  let detectLocal: NonNullable<Parameters<typeof pseudonymize>[1]>["detectLocal"];
  if (name !== "patterns") {
    const predict = await sharedPredict();
    if (!predict) return null;
    const { detectLocalNer } = await import("../src/local/detect");
    detectLocal = (text: string) => detectLocalNer(text, predict, { chunkSize: 1000 });
  }
  const options = policyOptions(policy);
  return async (text: string) => {
    const vault: Record<string, string> = {};
    await pseudonymize(text, { vault, ...options, ...(detectLocal ? { detectLocal } : {}) });
    return vault;
  };
}

/**
 * What engine a measurement was taken against — written into every result file.
 *
 * This exists because of a real cost: two columns of the same table were measured hours
 * apart, one of them against uncommitted engine work, and nothing in either file said so.
 * The gap read as a product weakness for as long as it took to re-measure by hand. A number
 * that cannot name the code that produced it is not a measurement.
 *
 * The hash covers the engine SOURCE (`src/engine`, `src/model`, `src/local`, `src/kinds.ts`)
 * and the catalog's level arithmetic, because `engines.ts` imports `../src/index` — the
 * source tree, not `dist/`. `head` and `dirty` place it in history; `dirty` is the one that
 * matters, since a modified tree is exactly the state that cannot be reproduced later.
 */
export function engineStamp(): { hash: string; head: string; dirty: boolean; files: number } {
  const roots = [join(HERE, "../src/engine"), join(HERE, "../src/model"), join(HERE, "../src/local"),
                 join(HERE, "../src/kinds.ts"), join(HERE, "../../catalog/src/redaction")];
  const h = createHash("sha256");
  let files = 0;
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) { for (const f of readdirSync(p).sort()) walk(join(p, f)); return; }
    if (!p.endsWith(".ts") || p.endsWith(".test.ts")) return;
    h.update(p.slice(p.indexOf("/src/"))).update(readFileSync(p)); files++;
  };
  for (const r of roots) walk(r);
  let head = "unknown", dirty = false;
  try {
    head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: HERE, encoding: "utf8" }).trim();
    dirty = execFileSync("git", ["status", "--porcelain", "--", "packages/redact/src", "packages/catalog/src"],
      { cwd: join(HERE, "../../.."), encoding: "utf8" }).trim().length > 0;
  } catch { /* not a checkout: the hash still identifies the code */ }
  return { hash: h.digest("hex").slice(0, 12), head, dirty, files };
}
