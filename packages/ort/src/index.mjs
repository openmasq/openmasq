// ESM facade — the implementation is in `index.cjs`, and exists only once (rule 9).
// `@huggingface/transformers` imports itself as ESM or CJS depending on which bundle wins; the
// two entries must therefore both exist, without which the fallback only half applies.
import { createRequire } from "node:module";

const shim = createRequire(import.meta.url)("./index.cjs");

export const { InferenceSession, Tensor, env, OPENMASQ_ORT_BACKEND } = shim;
export default shim;
