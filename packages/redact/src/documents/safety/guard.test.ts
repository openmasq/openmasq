import { describe, it, expect } from "vitest";
import {
  sniff,
  guardUpload,
  rasterScale,
  MAX_FILE_BYTES,
  MAX_RASTER_PIXELS,
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

/**
 * TIFF and WebP both route to OCR — i.e. to a full decode — and `sniff` used to report
 * neither's dimensions. The pixel-flood check runs only `if (s.width && s.height)`, so
 * for these two formats it never ran at all: a 40 000×40 000 TIFF was waved through the
 * very gate written to stop it. Headers are hand-built here because that is exactly the
 * attack — a few dozen bytes that DECLARE an enormous canvas.
 */
describe("dimensions TIFF / WebP — les deux formats qui contournaient le plafond", () => {
  /** A TIFF header + a first IFD declaring ImageWidth/ImageLength as LONG. */
  function tiffHeader(w: number, h: number, little = true): Uint8Array {
    const b = new Uint8Array(8 + 2 + 24 + 4);
    const dv = new DataView(b.buffer);
    b.set(little ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a], 0);
    dv.setUint32(4, 8, little); // first IFD right after the header
    dv.setUint16(8, 2, little); // two entries
    const entry = (off: number, tag: number, value: number) => {
      dv.setUint16(off, tag, little);
      dv.setUint16(off + 2, 4, little); // type LONG
      dv.setUint32(off + 4, 1, little); // count
      dv.setUint32(off + 8, value, little);
    };
    entry(10, 0x0100, w);
    entry(22, 0x0101, h);
    return b;
  }

  /** RIFF/WEBP with the given chunk fourCC and payload. */
  function webp(fourcc: string, payload: number[]): Uint8Array {
    const b = new Uint8Array(12 + 8 + payload.length);
    b.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    new DataView(b.buffer).setUint32(4, b.length - 8, true);
    b.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
    for (let i = 0; i < 4; i++) b[12 + i] = fourcc.charCodeAt(i);
    new DataView(b.buffer).setUint32(16, payload.length, true);
    b.set(payload, 20);
    return b;
  }

  /** VP8X extended header: flags(1) + reserved(3) + (w-1) and (h-1) as 24-bit LE. */
  const vp8x = (w: number, h: number) =>
    webp("VP8X", [
      0, 0, 0, 0,
      (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff,
      (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff,
    ]);

  /** VP8L lossless: 0x2f, then 14 bits of (w-1) and 14 of (h-1), packed LE. */
  const vp8l = (w: number, h: number) => {
    const bits = w - 1 + (h - 1) * 0x4000;
    return webp("VP8L", [
      0x2f,
      bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff,
    ]);
  };

  /** VP8 lossy: 3-byte frame tag, the 9d 01 2a start code, then w and h as 16-bit LE. */
  const vp8 = (w: number, h: number) =>
    webp("VP8 ", [
      0, 0, 0, 0x9d, 0x01, 0x2a,
      w & 0xff, (w >> 8) & 0x3f, h & 0xff, (h >> 8) & 0x3f,
    ]);

  it("lit les dimensions d'un TIFF, petit-boutien comme grand-boutien", () => {
    expect(sniff(tiffHeader(1024, 768))).toMatchObject({ family: "tiff", width: 1024, height: 768 });
    expect(sniff(tiffHeader(1024, 768, false))).toMatchObject({ family: "tiff", width: 1024, height: 768 });
  });

  it("lit les dimensions des trois encodages WebP", () => {
    expect(sniff(vp8x(3000, 2000))).toMatchObject({ family: "webp", width: 3000, height: 2000 });
    expect(sniff(vp8l(640, 480))).toMatchObject({ family: "webp", width: 640, height: 480 });
    expect(sniff(vp8(1280, 720))).toMatchObject({ family: "webp", width: 1280, height: 720 });
  });

  it("REFUSE désormais l'inondation de pixels sur ces deux formats", () => {
    // 28800 × 28800 ≈ 830 Mpx : ~3,3 Go une fois décodé en RGBA.
    expect(guardUpload(tiffHeader(28800, 28800), ".tiff")).toMatch(/dimensions excessives/i);
    expect(guardUpload(vp8x(28800, 28800), ".webp")).toMatch(/dimensions excessives/i);
  });

  it("laisse passer une image ordinaire de ces deux formats", () => {
    expect(guardUpload(tiffHeader(2480, 3508), ".tiff")).toBeNull(); // un A4 scanné à 300 dpi
    expect(guardUpload(vp8l(1600, 900), ".webp")).toBeNull();
  });

  it("ÉCHOUE FERMÉ : dimensions illisibles ⇒ refus, pour ces deux formats", () => {
    // Un IFD hors des octets fournis, et un morceau WebP qu'on ne sait pas lire : dans les
    // deux cas la toile n'est PAS mesurée, et les deux formats vont à l'OCR (décodage
    // complet). Un plafond qu'on ne peut pas appliquer n'est pas un plafond.
    const tiffTronque = bytes(0x49, 0x49, 0x2a, 0x00, 0xff, 0xff, 0xff, 0x7f);
    expect(guardUpload(tiffTronque, ".tiff")).toMatch(/illisible/i);
    expect(guardUpload(webp("ANIM", [0, 0, 0, 0]), ".webp")).toMatch(/illisible/i);
    // …et un VP8L dont la signature 0x2f manque : le morceau existe, la taille non.
    expect(guardUpload(webp("VP8L", [0x00, 1, 0, 0, 0]), ".webp")).toMatch(/illisible/i);
  });

  it("ne change RIEN pour les familles dont l'en-tête était déjà lu", () => {
    // Le repli fail-closed est réservé à TIFF/WebP : ailleurs, la politique reste
    // « on ne refuse que sur un signal POSITIF de danger ».
    expect(guardUpload(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ".png")).toBeNull();
  });
});

/**
 * The OTHER way an allocation gets chosen by the file: rasterising a PDF page for OCR.
 * Nothing is DECLARED there — the canvas is the page's own MediaBox times a fixed scale,
 * so a page the file makes enormous asks for an enormous canvas, and the process dies
 * before OCR reads a character. `rasterScale` is what both rasterisers
 * (`../ocr/pdf.ts`, `./browser.ts`) size their canvas through.
 */
describe("rasterScale — le plafond de pixels d'une page rendue", () => {
  const px = (w: number, h: number, s: number) => w * s * (h * s);

  it("laisse la qualité demandée à une page ordinaire", () => {
    // A4 en points (595×842) à l'échelle 2 : ~2 Mpx, très loin du plafond.
    expect(rasterScale(595, 842, 2)).toBe(2);
  });

  it("RABAISSE l'échelle d'une grande page au lieu de la refuser", () => {
    // Un très grand plan (4000×3000 pt) : 48 Mpx à l'échelle 2, sous le plafond une fois
    // rabaissée. Une page réellement grande est une chose qu'on dépose ; l'océriser moins
    // finement vaut mieux qu'une erreur.
    const s = rasterScale(4000, 3000, 2)!;
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThan(2);
    expect(px(4000, 3000, s)).toBeLessThanOrEqual(MAX_RASTER_PIXELS + 1);
  });

  it("REFUSE la page démesurée : 28800×28800 dépasse même à l'échelle 1", () => {
    // 28 800 pt est le maximum du format PDF lui-même : 830 Mpx à 1:1, 3,3 Gpx à
    // l'échelle 2 — soit ~13 Go de canvas. Le rasteriseur doit SAUTER la page.
    expect(rasterScale(28800, 28800, 2)).toBeNull();
  });

  it("refuse une taille de page illisible plutôt que de deviner", () => {
    expect(rasterScale(0, 1000, 2)).toBeNull();
    expect(rasterScale(Number.NaN, 100, 2)).toBeNull();
    expect(rasterScale(Number.POSITIVE_INFINITY, 100, 2)).toBeNull();
  });
});
