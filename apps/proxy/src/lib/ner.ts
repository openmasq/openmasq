// The on-device NER, loaded the way the desktop loads it: our BUNDLED multilingual student
// (`<dir>/<hfOrg>/ner-multilingual`), sha256-verified BEFORE onnxruntime
// touches a byte, never downloaded. No bundle ⇒ throw: the caller decides (fail closed by
// default, `--rules-only` is the user's explicit opt-out). Never logs the text — it is REAL PII.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "@openmasq/branding";
import { detectLocalNer, verifyWeights, type Detection, type WeightEntry } from "@openmasq/redact";
import { createNerPredict, NER_WEIGHTS_SHA256, type NerPredict } from "@openmasq/redact/ner";

/** Bundle folder name under the models dir — the same as the desktop's `NER_MODEL_ID`. */
export const NER_MODEL_ID = `${BRAND.hfOrg}/ner-multilingual`;

export type DetectLocal = (text: string) => Promise<Detection[]>;

/** Where a dev checkout keeps the baked models: `apps/desktop/build/ner-models` — four
 *  levels up from this file (`lib/` → `src|dist/` → `proxy/` → `apps/`), the same in `dist/`. */
export function devNerDir(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "..", "..", "..", "..", "desktop", "build", "ner-models");
}

/** The dir to use: the flag/env when given, else the dev bake when it exists, else "". */
export function resolveNerDir(configured: string): string {
  if (configured) return configured;
  const dev = devNerDir();
  return existsSync(join(dev, ...NER_MODEL_ID.split("/"))) ? dev : "";
}

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * Load the predictor from `dir`, fail-closed: a missing file or a hash mismatch throws
 * before any inference. Returns the `detectLocal` function `pseudonymize` expects.
 */
export async function loadNer(dir: string): Promise<DetectLocal> {
  const modelDir = join(dir, ...NER_MODEL_ID.split("/"));
  if (!existsSync(modelDir)) {
    throw new Error(
      `No NER model under ${dir}: expected ${NER_MODEL_ID.split("/").join("/")}/ inside it (the desktop's \`pnpm bake:ner\` output — point --ner at that bake's ROOT, not at a subfolder). The proxy never downloads.`,
    );
  }
  const entries: WeightEntry[] = Object.entries(NER_WEIGHTS_SHA256.multilingual).map(
    ([rel, sha256]) => ({
      path: join(modelDir, ...rel.split("/")),
      sha256,
    }),
  );
  await verifyWeights(entries, (p) => readFile(p), sha256Hex);
  const predict: NerPredict = await createNerPredict({
    modelName: NER_MODEL_ID,
    dtype: "q8",
    cacheDir: dir,
    allowLocalModels: true,
  });
  return (text) =>
    detectLocalNer(text, predict, {
      chunkSize: 1000,
      chunkOverlap: 100,
      // Re-throw: `detectLocalNer` otherwise swallows a post-load inference failure to `[]`,
      // which would forward the text with names in clear — the exact fail-open rule 7 forbids.
      onError: (err) => {
        throw err instanceof Error ? err : new Error(String(err));
      },
    });
}
