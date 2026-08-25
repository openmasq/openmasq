// The DESKTOP-only docTR OCR model bundle: db_mobilenet_v3_large (detection) +
// crnn_mobilenet_v3_small (recognition), self-exported FIRST-PARTY from Mindee's OFFICIAL
// pretrained weights via docTR's own `export_model_to_onnx` (`benchmark/ocr/scripts/
// export_onnx.py`) — NOT a third-party wrapper (OnnxTR), NOT a CDN. `@openmasq/redact`'s
// docTR engine (`src/doctr/engine.ts`) runs them when `OPENMASQ_DOCTR_MODEL_PATH` is set,
// for LATIN-script OCR (Tesseract stays the fallback for non-latin — see the router).
//
// No electron import here so BOTH the bake script (`scripts/bake-doctr-models.ts`) and the
// main-process asset wiring (`ocrAssets.ts`) can import the SAME pin — build + runtime agree.

/** The two ONNX model files, RELATIVE to the model dir (FP32; the int8 pair is unshipped
 *  pending accuracy re-validation). */
export const DOCTR_MODEL_FILES = Object.freeze(["db_mobilenet_v3_large.onnx", "crnn_mobilenet_v3_small.onnx"]);

/**
 * sha256 (hex) of each bundled model file. The AUTHORITATIVE integrity pin — re-verified
 * before onnxruntime parses the graph (fail-closed), the docTR analogue of the NER
 * `NER_WEIGHTS_SHA256` and the OCR `OCR_TRAINEDDATA_SHA256`. A tampered/substituted model is
 * REJECTED. The bake copies + verifies against THESE SAME hashes, so build and runtime agree;
 * it also writes them into `integrity.json` beside the models as a fallback, but the
 * authoritative check is against this in-CODE map (passed via `OPENMASQ_DOCTR_INTEGRITY`), so
 * replacing the models AND the co-located manifest still fails.
 *
 * ⚠️ Provenance: these are the bytes produced by `export_onnx.py` from docTR's official
 * `db_mobilenet_v3_large` + `crnn_mobilenet_v3_small` pretrained weights. Re-exporting is
 * deterministic; if a torch/docTR bump changes the bytes, re-run the export, re-pin here,
 * and note the reason.
 */
export const DOCTR_WEIGHTS_SHA256: Readonly<Record<string, string>> = Object.freeze({
  "db_mobilenet_v3_large.onnx": "5a82788a1907dccec9978c756f56d386fd2242597ba2630322da063af44cf4d3",
  "crnn_mobilenet_v3_small.onnx": "d89bbd3e732261c341c4cd50e3ad879233c852062866fd55b32c7d431dce301d",
});

/** The integrity map as the engine's `OPENMASQ_DOCTR_INTEGRITY` env expects it (`sha256-` prefixed). */
export function doctrIntegrityEnv(): string {
  const map: Record<string, string> = {};
  for (const [file, hex] of Object.entries(DOCTR_WEIGHTS_SHA256)) map[file] = `sha256-${hex}`;
  return JSON.stringify(map);
}
