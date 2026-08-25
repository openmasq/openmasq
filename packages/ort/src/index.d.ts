// Les types du moteur — parce que ce paquet PREND LA PLACE d'`onnxruntime-node` (override
// pnpm), et qu'un remplaçant sans déclarations casse tout consommateur TypeScript du nom
// remplacé : `packages/redact/src/ocr/doctr/engine.ts` importe `onnxruntime-node`, atterrit
// ici, et `tsc` le refuse (TS7016 — un `.mjs` n'a pas de types). Vu en CI, pas en local :
// seul le `typecheck` du paquet passe par là.
//
// ⚠️ Ce fichier décrit la surface COMMUNE aux deux entrées, et rien de plus. `index.cjs`
// ré-exporte tout le moteur sous-jacent (`{ ...impl }`) là où `index.mjs` n'en nomme que
// quatre : déclarer la surface CJS pour les deux ferait promettre à l'importateur ESM des
// symboles qui n'existeraient pas au chargement. `envelopperWasm` reste volontairement
// dehors — c'est l'interne testé par `index.test.ts`, qui le prend sur `./index.cjs`
// directement, pas une API.
import type * as OrtNative from "ort-native";

/**
 * Le moteur retenu à l'exécution. `"wasm"` sur les couples plateforme/arch sans binding
 * natif (Mac Intel) — c'est la seule chose que ce paquet ajoute au moteur, et elle est
 * lisible pour qu'un appelant puisse la journaliser ou l'afficher.
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
