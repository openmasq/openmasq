// Pure, dependency-free surface of the local NER detector. The heavy inference
// (model weights, onnx runtime) lives in the separate `./ner` entry so this
// barrel — and the main package barrel that re-exports it — never pulls
// @huggingface/transformers into a consumer's bundle.
export { detectLocalNer, type LocalDetectOptions } from "./detect";
export { nerLabelToCategory } from "./labels";
export {
  CharacterChunker,
  dedupe,
  type LocalSpan,
  type NerPredict,
  type ChunkerOptions,
} from "./chunker";
// Fail-closed sha256 pin of on-device weights — pure (read + digest injected), shared by the
// desktop workers (NER, embeddings), the bake and the local proxy.
export { verifyWeights, type WeightEntry } from "./verify";
