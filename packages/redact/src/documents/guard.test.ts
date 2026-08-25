import { describe, it, expect } from "vitest";
import {
  sniff,
  guardUpload,
  MAX_FILE_BYTES,
  MAX_ZIP_TOTAL_BYTES,
} from "./guard";

const bytes = (...vals: number[]) => new Uint8Array(vals);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34); // "%PDF-1.4"
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0); // "PK\x03\x04…"
const ELF = bytes(0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0); // "\x7fELF…"

/** A PNG header (sig + IHDR) declaring `w×h`, no pixel data. */
function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, w); // width (BE)
  new DataView(b.buffer).setUint32(20, h); // height (BE)
  return b;
}

/** A minimal, VALID-shaped ZIP: a local file header (so the leading bytes sniff
 *  as `zip`, like a real archive) + one central-dir entry DECLARING `uncompressed`
 *  bytes (no actual payload) + an End-Of-Central-Directory record. */
function zipDeclaring(uncompressed: number, compressed = 100): Uint8Array {
  const local = new Uint8Array(30); // local file header, PK\x03\x04, name len 0
  new DataView(local.buffer).setUint32(0, 0x04034b50, true);

  const name = new Uint8Array([0x78]); // "x"
  const cd = new Uint8Array(46 + name.length);
  const dv = new DataView(cd.buffer);
  dv.setUint32(0, 0x02014b50, true); // central file header sig
  dv.setUint32(20, compressed, true);
  dv.setUint32(24, uncompressed >>> 0, true);
  dv.setUint16(28, name.length, true);
  cd.set(name, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD sig
  ev.setUint16(8, 1, true); // entries on disk
  ev.setUint16(10, 1, true); // total entries
  ev.setUint32(12, cd.length, true); // CD size
  ev.setUint32(16, local.length, true); // CD offset (after the local header)

  const out = new Uint8Array(local.length + cd.length + eocd.length);
  out.set(local, 0);
  out.set(cd, local.length);
  out.set(eocd, local.length + cd.length);
  return out;
}

describe("sniff — leading-byte identification", () => {
  it("recognises pdf / zip / png / exe", () => {
    expect(sniff(PDF).family).toBe("pdf");
    expect(sniff(ZIP).family).toBe("zip");
    expect(sniff(pngHeader(10, 10)).family).toBe("png");
    expect(sniff(ELF).family).toBe("exe");
  });
  it("reads PNG dimensions from IHDR", () => {
    const s = sniff(pngHeader(1920, 1080));
    expect(s.width).toBe(1920);
    expect(s.height).toBe(1080);
  });
  it("unrecognised bytes → unknown (not an error)", () => {
    expect(sniff(bytes(0x78, 0x78, 0x78, 0x78)).family).toBe("unknown");
  });
  it("tolerates a junk/BOM prefix before %PDF", () => {
    expect(sniff(bytes(0xef, 0xbb, 0xbf, 0x25, 0x50, 0x44, 0x46)).family).toBe("pdf");
  });
});

describe("guardUpload — reject decisions", () => {
  it("allows a genuine PDF / DOCX-shaped ZIP / PNG", () => {
    expect(guardUpload(PDF, ".pdf")).toBeNull();
    expect(guardUpload(ZIP, ".docx")).toBeNull();
    expect(guardUpload(pngHeader(800, 600), ".png")).toBeNull();
  });

  it("rejects a .pdf whose bytes are really a ZIP", () => {
    expect(guardUpload(ZIP, ".pdf")).toMatch(/ne correspond pas/i);
  });

  it("rejects an executable posing as a document", () => {
    expect(guardUpload(ELF, ".pdf")).toMatch(/exécutable/i);
    expect(guardUpload(ELF, ".png")).toMatch(/exécutable/i);
  });

  it("rejects an over-size file before any parsing", () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46]); // valid %PDF head — size is what kills it
    expect(guardUpload(big, ".pdf")).toMatch(/trop volumineux/i);
  });

  it("rejects an image pixel-flood (tiny header, giant canvas)", () => {
    expect(guardUpload(pngHeader(60000, 60000), ".png")).toMatch(/dimensions excessives/i);
  });

  it("rejects a zip bomb declaring gigabytes uncompressed", () => {
    const bomb = zipDeclaring(MAX_ZIP_TOTAL_BYTES + 1);
    expect(guardUpload(bomb, ".docx")).toMatch(/anti-bombe/i);
  });

  it("allows a normal small ZIP (docx) below the bomb thresholds", () => {
    expect(guardUpload(zipDeclaring(50_000, 20_000), ".docx")).toBeNull();
  });

  it("allows images mislabelled between each other (png bytes as .jpg)", () => {
    expect(guardUpload(pngHeader(100, 100), ".jpg")).toBeNull();
  });

  it("never constrains text / unknown extensions on content", () => {
    expect(guardUpload(ELF, ".txt")).toBeNull(); // renamed exe as .txt → decoded as text, not run
    expect(guardUpload(ZIP, "")).toBeNull();
  });

  it("allows unknown bytes for a binary ext (parser is the final validator)", () => {
    // Mirrors core.test's 'mime picks pdf' fixture: bytes "x", declared .pdf.
    expect(guardUpload(bytes(0x78), ".pdf")).toBeNull();
  });
});
