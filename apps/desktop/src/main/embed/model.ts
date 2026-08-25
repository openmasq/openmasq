// The DESKTOP-only on-device sentence embedder for the MÉMOIRE's semantic recall +
// clustering: **multilingual-e5-small** (q8), BUNDLED with the app and loaded 100%
// offline — the app NEVER downloads it (mirrors `../ner/`: bake once at build time,
// sha256-verify at build AND load, no runtime fetch path at all).
//
// ⚠️ A memory card's text is REAL PII. This model exists so embeddings are computed
// ON-DEVICE — never wire the memory index to the remote `../embeddings.ts` `embed()`
// path (an OpenAI-compatible network endpoint): that would ship card text off-machine.

/** Bundled-folder id (NOT an HF repo id): loaded from `<cacheDir>/<id>/…` offline. */
import { BRAND } from "@openmasq/branding";

export const EMBED_MODEL_ID = `${BRAND.hfOrg}/multilingual-e5-small`;

/** The `memory_embeddings.model` tag — bump it when the export/quantization changes so
 *  every cached vector re-embeds (a vector from another export is not comparable). */
export const EMBED_MODEL_TAG = `${EMBED_MODEL_ID}@q8-1`;

/** e5 models REQUIRE these prefixes (asymmetric retrieval training); a card embeds as
 *  a passage, a search query as a query. Missing prefixes measurably degrade cosine. */
export const E5_PASSAGE_PREFIX = "passage: ";
export const E5_QUERY_PREFIX = "query: ";

/**
 * Provenance: self-exported FIRST-PARTY from `intfloat/multilingual-e5-small` (the model
 * author's official HF org — no community re-upload involved): AutoModel →
 * `last_hidden_state`-only ONNX (torch dynamo exporter) → QUInt8 dynamic quantization
 * (~118 MB), by `scratchpad e5/export_e5.py` (recipe kept in the bake script's header).
 * The bake stages it from `OPENMASQ_E5_SRC`; integrity comes from the sha256 pins below,
 * not from where the bytes are hosted (root rule 7). A durable first-party hosting of
 * this export (for CI) is the same tracked follow-up as the NER bake source.
 */
export const EMBED_UPSTREAM = Object.freeze({
  sourceRepo: "intfloat/multilingual-e5-small",
});

/**
 * sha256 (hex) of each bundled file, RELATIVE to the model dir. Verified TWICE, fail-
 * closed both times: by `scripts/bake-embed-models.ts` before writing into the app
 * resources, and by `worker.ts` (via `../ner/verify.ts` `verifyWeights`) before
 * onnxruntime parses them.
 */
export const EMBED_WEIGHTS_SHA256: Readonly<Record<string, string>> = {
  "config.json": "1127bf19b788557703f2e66d6b762f39490c650c7c4c88aa26150075b31ce44c",
  "tokenizer.json": "6040ba36e3e2f7b2fa6ae076b69d024a08666bea4c345105a32e542900fcc7e7",
  "tokenizer_config.json": "33b75086cc783ee5d78cab4dae0762d9cab1c40a8e0feb6e65d60c8d69a6afc1",
  "onnx/model_quantized.onnx": "ef6053363b6ae4c20f3b52a530ea81eddbf985f75f41bd5915c9df7de7777cfc",
};
