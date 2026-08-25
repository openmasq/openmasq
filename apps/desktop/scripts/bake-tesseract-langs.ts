/**
 * Bake the OCR `<lang>.traineddata` into `apps/desktop/build/tesseract-langs/`, laid down by
 * `electron-builder.cjs` `extraResources` → `${resourcesPath}/tesseract-langs` and loaded
 * OFFLINE at runtime (see `src/main/ocrAssets.ts` → `OPENMASQ_TESSERACT_LANG_PATH`).
 *
 * Closes audit M8: a packaged build otherwise downloaded traineddata TOFU from the jsdelivr
 * CDN with no integrity pin, then fed it to the native Tesseract WASM parser in the privileged
 * main process. We instead download each language from the OFFICIAL `tesseract-ocr/tessdata_fast`
 * repo and VERIFY its sha256 against `OCR_TRAINEDDATA_SHA256` (the pin the runtime re-checks) —
 * so the bake is reproducible + provably official, and a compromised mirror is rejected here too.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:tesseract` (part of `pnpm bake`). Idempotent —
 * a file already present with the right hash is skipped.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OCR_LANGS, OCR_TRAINEDDATA_SHA256 } from "@openmasq/redact/documents";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", "tesseract-langs");
// Pin the source to a reviewed COMMIT SHA so the download is reproducible + provably
// provenance-consistent (never the mutable `main` ref). Bytes are still sha256-verified
// against OCR_TRAINEDDATA_SHA256 below and the bake FAILS CLOSED on any mismatch, so a
// bump here can never silently ship different traineddata — it just aborts. Official repo:
// github.com/tesseract-ocr/tessdata_fast @ this commit.
const TESSDATA_FAST_COMMIT = "87416418657359cb625c412a48b6e1d6d41c29bd";
const BASE = `https://github.com/tesseract-ocr/tessdata_fast/raw/${TESSDATA_FAST_COMMIT}`;
const log = (m: string): void => console.log(`[bake:tesseract] ${m}`);

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

async function alreadyGood(path: string, want: string): Promise<boolean> {
  try {
    return sha256(new Uint8Array(await readFile(path))) === want;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const lang of OCR_LANGS) {
    const want = OCR_TRAINEDDATA_SHA256[lang];
    if (!want) throw new Error(`No pinned sha256 for "${lang}" in OCR_TRAINEDDATA_SHA256.`);
    const dest = join(OUT, `${lang}.traineddata`);
    if (await alreadyGood(dest, want)) {
      log(`${lang} ✓ (cached, hash ok)`);
      continue;
    }
    const url = `${BASE}/${lang}.traineddata`;
    log(`downloading ${lang} ← ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${lang}: HTTP ${res.status} fetching ${url}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const got = sha256(bytes);
    if (got !== want) {
      throw new Error(`${lang}: integrity check FAILED (expected ${want}, got ${got}). Refusing to bake.`);
    }
    await writeFile(dest, bytes);
    log(`${lang} ✓ verified (${bytes.byteLength} bytes)`);
  }
  log(`done → ${OUT} (${OCR_LANGS.length} langs, all sha256-verified vs tessdata_fast)`);
}

main().catch((e) => {
  console.error(`[bake:tesseract] ${e.message}`);
  process.exit(1);
});
