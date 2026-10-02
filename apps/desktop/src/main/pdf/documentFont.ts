import { app } from "electron";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOCUMENT_FONT, DOCUMENT_FONTS_DIRNAME, isPinnedDocumentFont } from "./documentFontSpec";

/**
 * Where the document font lives, and the ONE gate every consumer goes through: the bytes are
 * re-hashed against the pin (`documentFontSpec.ts`) before anything uses them. A missing,
 * truncated or swapped file yields `null` — the caller then uses a system face, never an
 * unverified file (fail closed, rule 7).
 *
 * Packaged: `${resourcesPath}/document-fonts` (electron-builder `extraResources`). Dev: the
 * bake output `apps/desktop/build/document-fonts`, resolved from `__dirname` = `out/main`.
 * No environment override on purpose: whoever sets the launch env must not choose the bytes
 * a font parser reads.
 */
function documentFontsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, DOCUMENT_FONTS_DIRNAME)
    : join(__dirname, "..", "..", "build", DOCUMENT_FONTS_DIRNAME);
}

/** The verified font bytes in `dir`, or `null`. */
export async function readVerifiedDocumentFont(dir = documentFontsDir()): Promise<Buffer | null> {
  const bytes = await readFile(join(dir, DOCUMENT_FONT.file)).catch(() => null);
  return bytes && isPinnedDocumentFont(bytes) ? bytes : null;
}

/** Verdict per directory, memoised: the file sits in the signed bundle (or the dev bake
 *  output) and the sandbox asks on every run. A dev who bakes after launch restarts. */
const verdicts = new Map<string, boolean>();

/** The document-fonts directory when its font verifies, else `null`. Synchronous because the
 *  jail argv is built synchronously (`../python/winJail.ts`). */
export function verifiedDocumentFontDir(dir = documentFontsDir()): string | null {
  let ok = verdicts.get(dir);
  if (ok === undefined) {
    try {
      ok = isPinnedDocumentFont(readFileSync(join(dir, DOCUMENT_FONT.file)));
    } catch {
      ok = false;
    }
    verdicts.set(dir, ok);
  }
  return ok ? dir : null;
}
