import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { STANDARD_FONT_FILE, standardFontBytes } from "./standardFonts";

const SHIPPED = readdirSync(join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts")).filter((f) =>
  /\.(pfb|ttf)$/.test(f),
);
const g = globalThis as { pdfjsStandardFonts?: Record<string, Uint8Array> };

afterEach(() => {
  delete g.pdfjsStandardFonts;
});

describe("standard fonts", () => {
  it("names EXACTLY the font files pdf.js ships — the fourteen the jail bundle embeds", () => {
    expect(SHIPPED).toHaveLength(14);
    for (const f of SHIPPED) expect(STANDARD_FONT_FILE.test(f), f).toBe(true);
  });

  it("serves a font from the pdfjs-dist beside pdf.js", async () => {
    const bytes = await standardFontBytes("LiberationSans-Regular.ttf");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("refuses any other name, a path above all", async () => {
    for (const bad of ["../package.json", "LICENSE_FOXIT", "Arial.ttf", "standard_fonts/FoxitSerif.pfb"]) {
      await expect(standardFontBytes(bad), bad).rejects.toThrow(/not a standard font/);
    }
  });

  it("prefers the embedded copy, and an embedded set missing the file is a failure, not a disk read", async () => {
    g.pdfjsStandardFonts = { "FoxitSerif.pfb": new Uint8Array([1, 2, 3]) };
    expect([...(await standardFontBytes("FoxitSerif.pfb"))]).toEqual([1, 2, 3]);
    await expect(standardFontBytes("LiberationSans-Regular.ttf")).rejects.toThrow(/not embedded/);
  });
});
