// utilityProcess child: on-device sentence embedding (transformers.js + onnxruntime-node)
// for the MÉMOIRE index — OUT of main like the NER worker (`../ner/worker.ts`), and for
// the same reasons: synchronous CPU inference must not freeze the main event loop, and
// the weights (~120 MB + an onnxruntime session) must be evictable by killing the
// process. **Never logs the texts — a memory card is REAL, un-redacted PII.**
//
// The model is BUNDLED (`scripts/bake-embed-models.ts`) and loaded 100% OFFLINE after a
// fail-closed sha256 re-verification (`../ner/verify.ts`, shared). NO download branch —
// no bundle ⇒ throw ⇒ the client rejects ⇒ the memory index is simply unavailable (the
// Mémoire view falls back to the category graph; nothing security-relevant degrades).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { verifyWeights, type WeightEntry } from "../ner/verify";
import { EMBED_WEIGHTS_SHA256, EMBED_MODEL_ID } from "./model";

interface ParentPort {
  on(ev: "message", cb: (e: { data: Req }) => void): void;
  postMessage(msg: Res): void;
}
interface Req {
  id: number;
  /** Prefixed texts ("passage: …" / "query: …") — the caller owns the e5 prefixes. */
  texts: string[];
}
type Res =
  | { id: number; ok: true; vectors: number[][] }
  | { id: number; ok: false; error: string };
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

const BUNDLED = process.env.EMBED_BUNDLED_DIR || "";
const MODEL_DIR = BUNDLED ? join(BUNDLED, ...EMBED_MODEL_ID.split("/")) : "";
const bundled = Boolean(MODEL_DIR) && existsSync(MODEL_DIR);

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

type EmbedFn = (texts: string[]) => Promise<number[][]>;
let embed: Promise<EmbedFn> | null = null;
function getEmbed(): Promise<EmbedFn> {
  if (embed) return embed;
  embed = loadEmbed().catch((err) => {
    embed = null;
    throw err;
  });
  return embed;
}

async function loadEmbed(): Promise<EmbedFn> {
  if (!bundled) {
    throw new Error(
      `Embed model not bundled at ${MODEL_DIR || "<unset EMBED_BUNDLED_DIR>"} — run \`pnpm bake:embed\`. ` +
        "The on-device embedder never downloads.",
    );
  }
  // Fail-closed integrity gate BEFORE onnxruntime touches the weights.
  const entries: WeightEntry[] = Object.entries(EMBED_WEIGHTS_SHA256).map(([rel, sha256]) => ({
    path: join(MODEL_DIR, ...rel.split("/")),
    sha256,
  }));
  await verifyWeights(entries, (p) => readFile(p), sha256Hex);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pipeline, env } = (await import("@huggingface/transformers")) as any;
  env.allowRemoteModels = false; // offline by construction, not by luck
  env.allowLocalModels = true;
  env.localModelPath = BUNDLED;
  const pipe = await pipeline("feature-extraction", EMBED_MODEL_ID, { dtype: "q8" });
  return async (texts: string[]) => {
    const out = await pipe(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  };
}

parentPort.on("message", (e) => {
  const { id, texts } = e.data;
  void (async () => {
    try {
      const fn = await getEmbed();
      parentPort.postMessage({ id, ok: true, vectors: await fn(texts) });
    } catch (err) {
      parentPort.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
