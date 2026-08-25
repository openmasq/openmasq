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
