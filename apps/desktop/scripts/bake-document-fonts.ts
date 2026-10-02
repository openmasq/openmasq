/**
 * Bake the DOCUMENT font (Inter, SIL OFL 1.1) + its licence into
 * `apps/desktop/build/document-fonts/`, laid down by `electron-builder.cjs` `extraResources`
 * → `${resourcesPath}/document-fonts`. Main embeds it in generated PDFs and points the Python
 * sandbox's documents and charts at it (`src/main/pdf/documentFont.ts`), re-verifying the
 * sha256 before any font parser reads it.
 *
 * ORIGIN: the official google/fonts repository at a PINNED COMMIT —
 *   https://raw.githubusercontent.com/google/fonts/<GOOGLE_FONTS_COMMIT>/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf
 *   https://raw.githubusercontent.com/google/fonts/<GOOGLE_FONTS_COMMIT>/ofl/inter/OFL.txt
 * Commit + digests live in `src/main/pdf/documentFontSpec.ts` (the one pin main re-checks).
 * Any digest mismatch FAILS the bake: never shipped, never retried into acceptance.
 *
 * Deliberately NOT part of the Python runtime: that archive is content-addressed and ~500 MB,
 * and a font change must not make every install re-download it.
 *
 * Run: `pnpm --filter @openmasq/desktop bake:fonts` (part of `pnpm bake`). Idempotent — a file
 * already present with the right hash is skipped.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_FONT,
  DOCUMENT_FONT_LICENSE,
  DOCUMENT_FONTS_DIRNAME,
  GOOGLE_FONTS_COMMIT,
  sha256Hex,
} from "../src/main/pdf/documentFontSpec";
import { fetchBytes } from "./fetchRetry";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "build", DOCUMENT_FONTS_DIRNAME);
const log = (m: string): void => console.log(`[bake:fonts] ${m}`);

async function alreadyGood(path: string, want: string): Promise<boolean> {
  try {
    return sha256Hex(new Uint8Array(await readFile(path))) === want;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const asset of [DOCUMENT_FONT, DOCUMENT_FONT_LICENSE]) {
    const dest = join(OUT, asset.file);
    if (await alreadyGood(dest, asset.sha256)) {
      log(`${asset.file} ✓ (cached, hash ok)`);
      continue;
    }
    log(`downloading ${asset.file} ← ${asset.url}`);
    const bytes = await fetchBytes(asset.url, { log });
    const got = sha256Hex(bytes);
    if (got !== asset.sha256) {
      throw new Error(`${asset.file}: integrity check FAILED (expected ${asset.sha256}, got ${got}). Refusing to bake.`);
    }
    await writeFile(dest, bytes);
    log(`${asset.file} ✓ verified (${bytes.byteLength} bytes)`);
  }
  log(`done → ${OUT} (google/fonts@${GOOGLE_FONTS_COMMIT.slice(0, 12)}, sha256-verified)`);
}

main().catch((e) => {
  console.error(`[bake:fonts] ${e.message}`);
  process.exit(1);
});
