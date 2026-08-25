// utilityProcess child: the offline NER inference (transformers.js + onnxruntime-node) moved
// OUT of the main process. A big page/document snapshot's inference takes SECONDS of
// synchronous CPU; in the main process it froze the whole event loop (IPC / the agent-browser
// overlay / other tabs). Here it runs in a SEPARATE process, so the main stays responsive.
// Via `utilityProcess.fork` (NOT ELECTRON_RUN_AS_NODE → works with the `RunAsNode:false`
// fuse). The electron `app` API isn't available in a utilityProcess, so the model dirs are
// passed in by the parent via env. **Never logs `text` — it is REAL, un-redacted PII.**
//
// The desktop loads the BUNDLED **multilingual mBERT** model (`NER_MODEL_ID`) 100% OFFLINE
// from the read-only resources dir — and FIRST re-verifies each weight file's sha256 vs
// `NER_WEIGHTS_SHA256` (fail-closed): a tampered/substituted ONNX or tokenizer is REJECTED
// before onnxruntime parses it. **There is no download path** — packaged or dev, the model is
// bundled by `scripts/bake-ner-models.ts` or the engine is simply unavailable (the client
// rejects, the renderer degrades to the regex rules). See `loadPredict` for why.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { detectLocalNer, type Detection } from "@openmasq/redact";
import { createNerPredict, type NerPredict } from "@openmasq/redact/ner";
import { NER_MODEL_ID, NER_WEIGHTS_SHA256 } from "./model";
import { verifyWeights, type WeightEntry } from "./verify";

// `process.parentPort` is injected by Electron in a utilityProcess child; @types/node
// doesn't know it, so type the minimal surface we use.
interface ParentPort {
  on(ev: "message", cb: (e: { data: Req }) => void): void;
  postMessage(msg: Res): void;
}
interface Req {
  id: number;
  text: string;
}
type Res =
  | { id: number; ok: true; detections: Detection[] }
  | { id: number; ok: false; error: string };
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

// The bundled model dir, from the parent (computed there via the electron `app` API).
// There is NO second source: the model is BUNDLED or the engine is unavailable.
const BUNDLED = process.env.NER_BUNDLED_DIR || "";

// `<resources>/ner-models/<hfOrg>/bert-base-multilingual-cased-ner-hrl`.
const MODEL_DIR = BUNDLED ? join(BUNDLED, ...NER_MODEL_ID.split("/")) : "";
const bundled = Boolean(MODEL_DIR) && existsSync(MODEL_DIR);

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

// A single warm predict fn (one model per platform now) — a Promise so concurrent first calls
// share one load. Not cached on failure, so the next call retries.
let predict: Promise<NerPredict> | null = null;
function getPredict(): Promise<NerPredict> {
  if (predict) return predict;
  predict = loadPredict().catch((err) => {
    predict = null;
    throw err;
  });
  return predict;
}

async function loadPredict(): Promise<NerPredict> {
  // ⚠️ NO download branch, deliberately. The offline engine used to fall back to fetching
  // mBERT from HuggingFace when no bundle was on disk — which meant: the FIRST redaction
  // needed the network, an offline user was blocked, and the bytes came from a third party
  // with no sha256 gate (the pin only ever covered the bundled path). Worse, the cache lived
  // in `os.tmpdir()`, which the OS purges — so a working install could silently regress to
  // "needs network". The model is now BUNDLED at build time (`scripts/bake-ner-models.ts`,
  // fail-closed) and this path is the ONLY one. No bundle ⇒ THROW: the client rejects and the
  // renderer degrades to the regex rules. Never re-add a fetch here.
  if (!bundled) {
    throw new Error(
      `NER model not bundled at ${MODEL_DIR || "<unset NER_BUNDLED_DIR>"} — run \`pnpm bake:ner\`. ` +
        "The offline engine never downloads.",
    );
  }
  // Fail-closed integrity gate BEFORE onnxruntime touches the weights.
  const entries: WeightEntry[] = Object.entries(NER_WEIGHTS_SHA256).map(([rel, sha256]) => ({
    path: join(MODEL_DIR, ...rel.split("/")),
    sha256,
  }));
  await verifyWeights(entries, (p) => readFile(p), sha256Hex);
  return createNerPredict({
    modelName: NER_MODEL_ID,
    dtype: "q8",
    cacheDir: BUNDLED,
    allowLocalModels: true,
  });
}

parentPort.on("message", (e) => {
  const { id, text } = e.data;
  void (async () => {
    try {
      const p = await getPredict();
      // Bigger windows than the 250-char default (a small window splits a record and hurts
      // detection); ~1000 chars ≈ 300-400 tokens stays under the model's ~512 cap with context.
      // `onError` RE-THROWS (audit M1): `detectLocalNer` otherwise SWALLOWS a POST-load
      // inference failure (an onnxruntime runtime error / OOM on one chunk) to `[]`, and
      // without an onError the worker would post `ok:true, detections:[]` — a silent
      // fail-OPEN that ships regex-only coverage. Re-throwing propagates it to the outer
      // catch → `ok:false` → the renderer fails CLOSED (blocks the send / masks the result).
      const detections = await detectLocalNer(text, p, {
        chunkSize: 1000,
        chunkOverlap: 100,
        onError: (err) => {
          throw err instanceof Error ? err : new Error(String(err));
        },
      });
      parentPort.postMessage({ id, ok: true, detections });
    } catch (err) {
      // A load/integrity/inference failure comes back as ok:false so the parent REJECTS and the
      // renderer fails CLOSED — never a silent [] that would leak un-redacted PII.
      parentPort.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
