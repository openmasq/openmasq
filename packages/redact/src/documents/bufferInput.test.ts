import { describe, it, expect } from "vitest";
import { asUint8, extractBytes } from "./node";

/**
 * pdf.js v4 REJECTS a Node `Buffer` ("Please provide binary data as `Uint8Array`,
 * rather than `Buffer`") and `Buffer.slice()` is a VIEW, not the copy the detach
 * guard needs — so a Buffer fed to the bytes entry failed BOTH pdf layers and every
 * « Texte extrait » of a stored PDF came back empty (the reported bug: the desktop's
 * `files:extract-bytes` IPC passes `Buffer.from(base64)`). `asUint8` is the entry
 * guard; these pin it.
 */
describe("asUint8 — the pdf.js Buffer contract guard", () => {
  it("converts a Buffer to a PLAIN Uint8Array copy (same bytes, detached from the Buffer)", () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    const u8 = asUint8(buf);
    expect(Buffer.isBuffer(u8)).toBe(false);
    expect(u8).toBeInstanceOf(Uint8Array);
    expect([...u8]).toEqual([1, 2, 3, 4]);
    // A COPY, not a view: pdf.js detaches the ArrayBuffer it is handed, so sharing
    // the Buffer's memory would corrupt the caller's bytes for the OCR pass.
    buf[0] = 99;
    expect(u8[0]).toBe(1);
    // …and its own `.slice()` is now the real Uint8Array copy semantics.
    expect(Buffer.isBuffer(u8.slice())).toBe(false);
  });

  it("passes a plain Uint8Array through untouched (no needless copy)", () => {
    const u8 = new Uint8Array([5, 6]);
    expect(asUint8(u8)).toBe(u8);
  });

  it("extractBytes accepts a Buffer for a text file end-to-end", async () => {
    const out = await extractBytes(Buffer.from("Jean Rebour, 06 12 34 56 78", "utf8"), "note.txt", "text/plain");
    expect(out.error).toBeUndefined();
    expect(out.text).toContain("Jean Rebour");
  });
});
