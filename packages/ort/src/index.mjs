// Façade ESM — l'implémentation est dans `index.cjs`, et n'existe qu'une fois (règle 9).
// `@huggingface/transformers` s'importe en ESM comme en CJS selon le bundle qui gagne ; les
// deux entrées doivent donc exister, sans quoi le repli ne s'applique qu'à moitié.
import { createRequire } from "node:module";

const shim = createRequire(import.meta.url)("./index.cjs");

export const { InferenceSession, Tensor, env, OPENMASQ_ORT_BACKEND } = shim;
export default shim;
