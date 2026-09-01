/**
 * Bake the DESKTOP on-device MEMORY embedder (multilingual-e5-small, q8) into
 * `apps/desktop/build/embed-models/${EMBED_MODEL_ID}/`, laid down by
 * `electron-builder.cjs` `extraResources` → `${resourcesPath}/embed-models` and loaded
 * 100% OFFLINE at runtime (`src/main/embed/worker.ts`, fail-closed sha256 re-verify).
 *
 * The export is SELF-PRODUCED first-party from `intfloat/multilingual-e5-small` (the
 * author's official org) — AutoModel → last_hidden_state ONNX (torch dynamo exporter) →
 * QUInt8 dynamic quantization; the recipe lives with the redact bench notes. There is
 * therefore NO public upstream serving these exact bytes: the source is `OPENMASQ_E5_SRC`
 * (a local export dir or an `https://…` base URL — point CI at a durable first-party
 * bucket; same open item as the NER bake source). Every byte is verified against
 * `EMBED_WEIGHTS_SHA256` before writing — integrity comes from the pin, not the host.
 *
 * ⚠️ Unlike `bake:ner`, a MISSING source SKIPS (loud warning) instead of failing the
 * build: the embedder gates a FEATURE (semantic clustering/recall — the app falls back
 * to the category graph), not the redaction pipeline, and there is no runtime download
 * to regress to (the worker never fetches). A HASH MISMATCH still fails hard.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:embed`. Idempotent by hash.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBED_WEIGHTS_SHA256, EMBED_MODEL_ID } from "../src/main/embed/model";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", "embed-models", ...EMBED_MODEL_ID.split("/"));
const SRC = process.env.OPENMASQ_E5_SRC || "";
const log = (m: string): void => console.log(`[bake:embed] ${m}`);

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

async function hashOf(path: string): Promise<string | null> {
  try {
    return sha256(new Uint8Array(await readFile(path)));
  } catch {
    return null;
  }
}

async function readSource(rel: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(SRC)) {
    const url = `${SRC.replace(/\/$/, "")}/${rel}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(join(SRC, ...rel.split("/"))));
}

async function main(): Promise<void> {
  const rels = Object.keys(EMBED_WEIGHTS_SHA256);
  const cached = await Promise.all(
    rels.map(async (rel) => (await hashOf(join(OUT, ...rel.split("/")))) === EMBED_WEIGHTS_SHA256[rel]),
  );
  if (cached.every(Boolean)) {
    log(`done (all cached, hashes ok) → ${OUT}`);
    return;
  }
  if (!SRC) {
    log("⚠️ OPENMASQ_E5_SRC unset and no cached bundle — SKIPPING. The Mémoire's semantic");
    log("   clustering will be unavailable in this build (falls back to the category graph).");
    return;
  }
  for (const rel of rels) {
    const want = EMBED_WEIGHTS_SHA256[rel];
    const dest = join(OUT, ...rel.split("/"));
    if ((await hashOf(dest)) === want) {
      log(`${rel} ✓ (cached, hash ok)`);
      continue;
    }
    const bytes = await readSource(rel).catch((e: Error) => {
      throw new Error(`${rel}: cannot read from OPENMASQ_E5_SRC (${SRC}) — ${e.message}`);
    });
    const got = sha256(bytes);
    if (got !== want) {
      throw new Error(
        `${rel}: integrity check FAILED (expected ${want}, got ${got}) from ${SRC}. Refusing to bake.`,
      );
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    log(`${rel} ✓ verified (${bytes.byteLength} bytes)`);
  }
  log(`done → ${OUT} (${EMBED_MODEL_ID}, all sha256-verified vs EMBED_WEIGHTS_SHA256)`);
}

main().catch((e) => {
  console.error(`[bake:embed] ${e.message}`);
  process.exit(1);
});
