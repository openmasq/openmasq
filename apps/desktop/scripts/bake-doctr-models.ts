/**
 * Bake the docTR OCR models into `apps/desktop/build/doctr-models/`, laid down by
 * `electron-builder.cjs` `extraResources` → `${resourcesPath}/doctr-models` and loaded
 * OFFLINE at runtime (see `src/main/ocrAssets.ts` → `OPENMASQ_DOCTR_MODEL_PATH`).
 *
 * The models are self-exported FIRST-PARTY from Mindee's OFFICIAL pretrained weights via
 * docTR's own `export_model_to_onnx` (`benchmark/ocr/scripts/export_onnx.py`) — NOT a
 * third-party wrapper, NOT a CDN. This script COPIES that export from `OPENMASQ_DOCTR_SRC`
 * (default: the repo's `benchmark/ocr/results/onnx`) and **sha256-verifies each file** vs
 * `DOCTR_WEIGHTS_SHA256` (the pin the runtime re-checks) — refusing to bake on a mismatch,
 * exactly like `bake-tesseract-langs.ts` / `bake-ner-models.ts`. It also writes an
 * `integrity.json` beside the models (fallback pin).
 *
 * ⚠️ CI: point `OPENMASQ_DOCTR_SRC` at the DURABLE source (a first-party object bucket / release
 * asset holding the exported ONNX, pinned by these sha256s) once published — integrity comes
 * from the pin, not the host. To reproduce the export from scratch: run `export_onnx.py`
 * (needs python-doctr + torch), then re-pin `DOCTR_WEIGHTS_SHA256` if the bytes changed.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:doctr` (part of `pnpm bake`). Idempotent.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCTR_MODEL_FILES, DOCTR_WEIGHTS_SHA256 } from "../src/main/ocr/doctrModels";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const OUT = join(HERE, "..", "build", "doctr-models");
const SRC = process.env.OPENMASQ_DOCTR_SRC || join(REPO, "benchmark", "ocr", "results", "onnx");
const log = (m: string): void => console.log(`[bake:doctr] ${m}`);

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

async function main(): Promise<void> {
  // ⚠️ A MISSING source SKIPS (loud warning) rather than failing the build, exactly like
  // `bake:embed`: docTR gates OCR QUALITY on Latin scripts, and the runtime already treats
  // its absence as a fallback rather than an error (`ocrAssets.ts`: « bake not run ⇒
  // Tesseract-only (no failure) »). Failing here made `pnpm bake` — and therefore `dist`
  // and `release` — unreachable for anyone without the export, which is everyone cloning
  // this repository. A HASH MISMATCH still fails hard: that is the integrity claim.
  if (!existsSync(SRC)) {
    log(`⚠️ no export at ${SRC} — SKIPPING. Latin-script OCR falls back to Tesseract in this`);
    log("   build. Set OPENMASQ_DOCTR_SRC to a pinned export to include the docTR models.");
    return;
  }
  await mkdir(OUT, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const file of DOCTR_MODEL_FILES) {
    const want = DOCTR_WEIGHTS_SHA256[file];
    if (!want) throw new Error(`No pinned sha256 for "${file}" in DOCTR_WEIGHTS_SHA256.`);
    const bytes = new Uint8Array(await readFile(join(SRC, file)).catch(() => {
      throw new Error(`missing "${file}" in ${SRC} — set OPENMASQ_DOCTR_SRC or run export_onnx.py first.`);
    }));
    const got = sha256(bytes);
    if (got !== want) {
      throw new Error(`${file}: integrity check FAILED (expected ${want}, got ${got}). Refusing to bake.`);
    }
    await writeFile(join(OUT, file), bytes);
    manifest[file] = `sha256-${got}`;
    log(`${file} ✓ verified (${bytes.byteLength} bytes)`);
  }
  await writeFile(join(OUT, "integrity.json"), JSON.stringify(manifest, null, 2));
  log(`done → ${OUT} (${DOCTR_MODEL_FILES.length} models, all sha256-verified + integrity.json)`);
}

main().catch((e) => {
  console.error(`[bake:doctr] ${e.message}`);
  process.exit(1);
});
