import { describe, it, expect, vi, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* The ONE gate between a font file on disk and the two parsers that read it (Chromium's in
   the print window, fpdf2/matplotlib in the jail): only the pinned bytes pass, anything else
   is `null` and the caller uses a system face. The pin is swapped for a fixture's digest so
   the test does not depend on a bake having run. */

const GOOD = Buffer.from("pinned-font-bytes");
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("./documentFontSpec", async (orig) => {
  const real = await orig<typeof import("./documentFontSpec")>();
  const sha256 = createHash("sha256").update(Buffer.from("pinned-font-bytes")).digest("hex");
  const DOCUMENT_FONT = { ...real.DOCUMENT_FONT, sha256 };
  return {
    ...real,
    DOCUMENT_FONT,
    isPinnedDocumentFont: (b: Uint8Array) => real.sha256Hex(b) === sha256,
  };
});

import { readVerifiedDocumentFont, verifiedDocumentFontDir } from "./documentFont";

const ROOT = mkdtempSync(join(tmpdir(), "openmasq-docfont-"));
const dirWith = (name: string, bytes?: Buffer): string => {
  const d = join(ROOT, name);
  mkdirSync(d, { recursive: true });
  if (bytes) writeFileSync(join(d, "Inter.ttf"), bytes);
  return d;
};
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("document font — verified or nothing", () => {
  it("hands back the pinned bytes and their directory", async () => {
    const d = dirWith("good", GOOD);
    expect((await readVerifiedDocumentFont(d))?.equals(GOOD)).toBe(true);
    expect(verifiedDocumentFontDir(d)).toBe(d);
  });

  it("refuses a swapped file (fails closed: no bytes, no directory)", async () => {
    const d = dirWith("swapped", Buffer.from("attacker-controlled-font"));
    expect(await readVerifiedDocumentFont(d)).toBeNull();
    expect(verifiedDocumentFontDir(d)).toBeNull();
  });

  it("treats a missing file as absent", async () => {
    const d = dirWith("empty");
    expect(await readVerifiedDocumentFont(d)).toBeNull();
    expect(verifiedDocumentFontDir(d)).toBeNull();
  });

  it("the real pin names the official google/fonts file at a commit, not a branch", async () => {
    const real = await vi.importActual<typeof import("./documentFontSpec")>("./documentFontSpec");
    expect(real.DOCUMENT_FONT.url).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/ofl\/inter\//,
    );
    expect(real.DOCUMENT_FONT.url).toContain(real.GOOGLE_FONTS_COMMIT);
    expect(real.DOCUMENT_FONT.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(real.DOCUMENT_FONT_LICENSE.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
