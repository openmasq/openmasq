/**
 * The bytes of pdf.js's STANDARD fonts (the 14 base fonts a PDF may name without embedding:
 * Helvetica, Times, Courier, Symbol, ZapfDingbats), handed to pdf.js by `./pdfFactories.ts`.
 *
 * ⚠️ Why not the system's: with `useSystemFonts`, pdf.js in Node asks the CANVAS to draw a
 * non-embedded font by name, and a machine without a matching face draws NOTHING — measured on
 * an Ubuntu 26.04 runner, a page of Helvetica text rendered without one pixel of ink, so the
 * blank-page check (`./blank.ts`) took it for paper. The fonts pdf.js ships render the same on
 * every machine.
 *
 * Where they come from: inside the extraction jail, the copy EMBEDDED in its sealed bundle
 * (`apps/desktop/scripts/build-extract-sandbox.mjs` sets `globalThis.pdfjsStandardFonts`), so
 * the jail reads no font file from disk; anywhere else, `pdfjs-dist/standard_fonts/` beside the
 * pdf.js that renders. Only the files pdf.js itself names are served (`STANDARD_FONT_FILE`).
 */
export const STANDARD_FONT_FILE = /^(?:Foxit(?:Dingbats|Symbol|(?:Fixed|Serif)(?:Bold|BoldItalic|Italic)?)\.pfb|LiberationSans-(?:Regular|Bold|BoldItalic|Italic)\.ttf)$/;

type Embedded = Readonly<Record<string, Uint8Array>>;

async function fromPdfjsDist(filename: string): Promise<Uint8Array> {
  const [{ createRequire }, { readFile }, { dirname, join }] = await Promise.all([
    import("node:module"),
    import("node:fs/promises"),
    import("node:path"),
  ]);
  // `import.meta.url` in both builds: tsup's `shims` supplies it to the CommonJS one.
  const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  return new Uint8Array(await readFile(join(root, "standard_fonts", filename)));
}

/** One standard font file's bytes. Throws for a name pdf.js does not ship, or a copy that is missing. */
export async function standardFontBytes(filename: string): Promise<Uint8Array> {
  if (!STANDARD_FONT_FILE.test(filename)) throw new Error(`not a standard font file: ${filename}`);
  const embedded = (globalThis as { pdfjsStandardFonts?: Embedded }).pdfjsStandardFonts;
  if (embedded) {
    const bytes = embedded[filename];
    if (!bytes) throw new Error(`standard font not embedded: ${filename}`);
    return bytes.slice();
  }
  return fromPdfjsDist(filename);
}
