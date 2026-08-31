// The engine's types — because this package TAKES THE PLACE of `onnxruntime-node`
// (pnpm override), and a replacement with no declarations breaks every TypeScript
// consumer of the replaced name: `packages/redact/src/ocr/doctr/engine.ts` imports
// `onnxruntime-node`, lands here, and `tsc` rejects it (TS7016 — a `.mjs` has no types).
// Seen in CI, not locally: only the package's `typecheck` goes through there.
//
// ⚠️ This file describes the surface COMMON to both entries, and nothing more. `index.cjs`
// re-exports the whole underlying engine (`{ ...impl }`) where `index.mjs` names only
// four: declaring the CJS surface for both would make the ESM importer a promise of
// symbols that wouldn't exist at load time. `envelopperWasm` deliberately stays
// outside — it's the internal tested by `index.test.ts`, which takes it from `./index.cjs`
// directly, not an API.
import type * as OrtNative from "ort-native";

/**
 * The engine picked at runtime. `"wasm"` on platform/arch pairs with no native
 * binding (Mac Intel) — this is the only thing this package adds to the engine, and it's
 * readable so a caller can log or display it.
 */
export declare const OPENMASQ_ORT_BACKEND: "native" | "wasm";

export declare const InferenceSession: typeof OrtNative.InferenceSession;
export declare const Tensor: typeof OrtNative.Tensor;
export declare const env: typeof OrtNative.env;

declare const shim: {
  InferenceSession: typeof OrtNative.InferenceSession;
  Tensor: typeof OrtNative.Tensor;
  env: typeof OrtNative.env;
  OPENMASQ_ORT_BACKEND: "native" | "wasm";
};

export default shim;
