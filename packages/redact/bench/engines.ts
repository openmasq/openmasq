/**
 * The engines every bench loads — ONE home (rule 9), so `compare.mts` (values) and
 * `spans/run.mts` (offsets) measure exactly the same pipeline.
 *
 *   patterns   — the deterministic pipeline alone (`pseudonymize` with no model).
 *   ner        — the product: deterministic + the bundled local NER, q8 on CPU through
 *                @huggingface/transformers, the same weights the desktop app ships
 *                (needs `pnpm build`, which bakes and sha256-pins them).
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
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categoriesForLevel, disabledKindsOf } from "../../catalog/src/redaction/levels";

const HERE = dirname(fileURLToPath(import.meta.url));
export type EngineName = "patterns" | "ner" | "ner-strict";
export type Policy = "bare" | "renforce" | "strict";
/** Runs the pipeline on one text; returns the vault (token → real value) it filled. */
export type Engine = (text: string) => Promise<Record<string, string>>;

/** The policy's engine options — for a level, the same derivation the app performs on every send. */
export function policyOptions(policy: Policy) {
  if (policy === "bare") return {};
  const strict = policy === "strict";
  return {
    disabledKinds: disabledKindsOf(categoriesForLevel(policy)),
    commercialNotoriety: !strict,
    peopleNotoriety: !strict,
  };
}

export async function loadEngine(name: EngineName, policy: Policy = name === "ner-strict" ? "strict" : "renforce"): Promise<Engine | null> {
  const { pseudonymize } = await import("../src/index");
  let detectLocal: NonNullable<Parameters<typeof pseudonymize>[1]>["detectLocal"];
  if (name !== "patterns") {
    const MODELS = join(HERE, "../../../apps/desktop/build/ner-models");
    if (!existsSync(join(MODELS, "openmasq/bert-base-multilingual-cased-ner-hrl/config.json"))) {
      console.error(`! local NER model missing under ${MODELS} — run \`pnpm build\` first`); return null;
    }
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = true; tf.env.localModelPath = MODELS;
    const pipe = await tf.pipeline("token-classification", "openmasq/bert-base-multilingual-cased-ner-hrl", { dtype: "q8" });
    const { createNerPredict } = await import("../src/local/ner");
    const { detectLocalNer } = await import("../src/local/detect");
    const predict = await createNerPredict({ pipeline: (t: string, o?: unknown) => pipe(t, o as Parameters<typeof pipe>[1]), modelKey: "multilingual" });
    detectLocal = (text: string) => detectLocalNer(text, predict, { chunkSize: 1000 });
  }
  const options = policyOptions(policy);
  return async (text: string) => {
    const vault: Record<string, string> = {};
    await pseudonymize(text, { vault, ...options, ...(detectLocal ? { detectLocal } : {}) });
    return vault;
  };
}
