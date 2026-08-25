import { describe, expect, it } from "vitest";
import { OCR_LANGS, OCR_TRAINEDDATA_SHA256 } from "./core";

/*
 * Fail-open guard for the OCR traineddata integrity pin (audit M8/M9). Both the desktop
 * OCR (`ocr.ts`) and the browser extension (`apps/extension/src/offscreen/ocr.ts`) pass
 * `OCR_TRAINEDDATA_SHA256` as tesseract2's `integrity` map, and tesseract2 only verifies a
 * lang whose code is PRESENT in that map (`opts.integrity?.[lang.code]`). So a language
 * shipped in `OCR_LANGS` WITHOUT a pin here would load its `.traineddata` UNVERIFIED — a
 * silent fail-open on the exact vector rule 7 forbids. This test makes adding a lang
 * without its sha256 a red build.
 */
describe("OCR traineddata integrity pin covers every bundled language", () => {
  it("has a sha256 for each OCR_LANGS entry (no unverified lang)", () => {
    const missing = OCR_LANGS.filter((l) => !OCR_TRAINEDDATA_SHA256[l]);
    expect(missing).toEqual([]);
  });

  it("every pin is a lowercase 64-hex sha256 (no placeholder / malformed digest)", () => {
    for (const [lang, digest] of Object.entries(OCR_TRAINEDDATA_SHA256)) {
      expect(digest, `pin for "${lang}"`).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
