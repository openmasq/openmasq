/**
 * Bake the DESKTOP offline NER model (multilingual mBERT, q8) into
 * `apps/desktop/build/ner-models/${NER_MODEL_ID}/`, laid down by `electron-builder.cjs`
 * `extraResources` → `${resourcesPath}/ner-models` and loaded 100% OFFLINE at runtime
 * (`src/main/ner/worker.ts`, `allowLocalModels`).
 *
 * ⚠️ THE APP NEVER DOWNLOADS THE MODEL. The weights are fetched exactly ONCE, HERE, at BUILD
 * time, from the pinned immutable upstream (`model.ts` `NER_UPSTREAM`), and every byte is
 * verified against `NER_WEIGHTS_SHA256` before it is written. The runtime re-verifies the SAME
 * hashes before onnxruntime parses them, so build + load agree and a tampered/substituted
 * weight is rejected fail-closed at both ends. Integrity comes from the sha256 pin, NOT from
 * where the bytes are hosted — which is what lets us fetch them at all (root rule 7).
 *
 * This script FAILS the build when it cannot produce a verified bundle (mirroring
 * `bake-doctr-models.ts`). It must never "succeed" with an empty dir: a packaged app with no
 * model used to silently fall back to a RUNTIME HuggingFace download — the exact thing the
 * offline engine exists to avoid, and invisible until a user was offline.
 *
 * Source precedence:
 *  - `OPENMASQ_NER_SRC` — a local directory OR an `https://…` base URL (point CI at a durable
 *    first-party bucket to stop depending on a third party at build time);
 *  - else the pinned `NER_UPSTREAM` commit on HuggingFace.
 * Either way the sha256 gate is identical — the source only changes WHO serves the bytes.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:ner`. Idempotent — a file already present with
 * the right hash is skipped (so a re-bake costs nothing and CI can cache `build/ner-models`).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NER_MODEL_ID, NER_UPSTREAM, NER_WEIGHTS_SHA256 } from "../src/main/ner/model";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", "ner-models", ...NER_MODEL_ID.split("/"));
const SRC = process.env.OPENMASQ_NER_SRC || "";
const log = (m: string): void => console.log(`[bake:ner] ${m}`);

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

async function hashOf(path: string): Promise<string | null> {
  try {
    return sha256(new Uint8Array(await readFile(path)));
  } catch {
    return null;
  }
}

/** Where `rel` is served from — a local dir, an explicit base URL, or the pinned upstream. */
function sourceOf(rel: string): { kind: "file" | "url"; at: string } {
  if (SRC && /^https?:\/\//i.test(SRC)) return { kind: "url", at: `${SRC.replace(/\/$/, "")}/${rel}` };
  if (SRC) return { kind: "file", at: join(SRC, ...rel.split("/")) };
  const { repo, revision } = NER_UPSTREAM;
  return { kind: "url", at: `https://huggingface.co/${repo}/resolve/${revision}/${rel}` };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main(): Promise<void> {
  for (const [rel, want] of Object.entries(NER_WEIGHTS_SHA256)) {
    const dest = join(OUT, ...rel.split("/"));
    if ((await hashOf(dest)) === want) {
      log(`${rel} ✓ (cached, hash ok)`);
      continue;
    }
    const src = sourceOf(rel);
    const bytes =
      src.kind === "url"
        ? await fetchBytes(src.at).catch((e: Error) => {
            throw new Error(`${rel}: cannot fetch from ${src.at} — ${e.message}`);
          })
        : new Uint8Array(
            await readFile(src.at).catch(() => {
              throw new Error(`${rel}: missing in OPENMASQ_NER_SRC (${src.at})`);
            }),
          );
    // The gate. A mismatch is NOT a warning: bad bytes must never reach a shipped build.
    const got = sha256(bytes);
    if (got !== want) {
      throw new Error(
        `${rel}: integrity check FAILED (expected ${want}, got ${got}) from ${src.at}. Refusing to bake.`,
      );
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    log(`${rel} ✓ verified (${bytes.byteLength} bytes)`);
  }
  log(`done → ${OUT} (${NER_MODEL_ID}, all sha256-verified vs NER_WEIGHTS_SHA256)`);
}

main().catch((e) => {
  console.error(`[bake:ner] ${e.message}`);
  process.exit(1);
});
