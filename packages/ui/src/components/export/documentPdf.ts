import { tableRowRuns, type Block, type Run } from "./documentBlocks";
import { base64ToBytes } from "../../state/files/bytes";

/**
 * Renders a document's `Block[]` to a clean, paginated PDF with pdf-lib — fully
 * client-side (no backend, CSP-safe), so the export is instant and on-device.
 * pdf-lib is lazy-`import()`ed (kept external in tsup) so it code-splits out of the
 * main bundle. Uses the standard Helvetica/Courier fonts (WinAnsi), so text is
 * sanitised to that charset (`toWinAnsi`) — a text document, not a pixel render of
 * the on-screen card.
 */

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface Fonts {
  regular: any;
  bold: any;
  italic: any;
  boldItalic: any;
  mono: any;
}

/** Reduce text to the WinAnsi charset the standard fonts can encode (smart quotes /
 *  dashes / ellipsis → ASCII; anything truly outside Latin-1 + the CP1252 extras is
 *  dropped) so pdf-lib never throws on an un-encodable glyph. Pure — unit-tested. */
export function toWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // THIN non-breaking spaces fold back onto the FULL non-breaking space (U+00A0), which
    // EXISTS in WinAnsi (0xA0) — flattening it to a plain space would make breakable again the
    // « 12 000 € » that `microTypography.ts` just welded together.
    .replace(/[  ]/g, " ")
    .replace(/[^\t\n\x20-\x7E -ÿŒœŠšŽžŸ€]/g, "");
}

interface Seg {
  text: string;
  font: any;
  size: number;
}

/** Break styled runs into lines fitting `maxWidth`. Tokenises across runs while
 *  preserving the ACTUAL whitespace between them — so `**Paris**,` stays "Paris,"
 *  (no spurious space before the comma) — and honours explicit `\n` as a break. */
function layoutRuns(runs: Run[], size: number, fonts: Fonts, maxWidth: number): Seg[][] {
  const lines: Seg[][] = [[]];
  let x = 0;
  let pendingSpace = false;
  const put = (text: string, font: any) => lines[lines.length - 1].push({ text, font, size });
  const newline = () => {
    lines.push([]);
    x = 0;
    pendingSpace = false;
  };
  for (const run of runs) {
    const font = fontFor(run, fonts);
    const spaceW = font.widthOfTextAtSize(" ", size);
    // Split keeping whitespace runs, so a run boundary without whitespace joins.
    // ⚠️ The non-breaking space (U+00A0) is INSIDE `\s` for JavaScript — the explicit
    // class excludes it, otherwise « 12 000 » would break exactly where it must not.
    for (const part of toWinAnsi(run.text).split(/([ \t\n\r\f\v]+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (part.includes("\n")) newline();
        else pendingSpace = true;
        continue;
      }
      const word = part;
      const w = font.widthOfTextAtSize(word, size);
      const needSpace = pendingSpace && x > 0;
      if (x > 0 && x + (needSpace ? spaceW : 0) + w > maxWidth) newline();
      else if (needSpace) {
        put(" ", font);
        x += spaceW;
      }
      pendingSpace = false;
      // Hard-break a single word wider than the whole line (long URL / token).
      if (w > maxWidth) {
        for (const ch of word) {
          const cw = font.widthOfTextAtSize(ch, size);
          if (x + cw > maxWidth) newline();
          put(ch, font);
          x += cw;
        }
      } else {
        put(word, font);
        x += w;
      }
    }
  }
  return lines;
}

function fontFor(run: Run, fonts: Fonts): any {
  if (run.code) return fonts.mono;
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

const HEADING_SIZE: Record<number, number> = { 1: 22, 2: 17, 3: 14, 4: 12, 5: 12, 6: 12 };

/** Decode a `data:image/(png|jpeg)` URI and embed it. `null` for any other type — pdf-lib
 *  supports exactly these two, and a silent skip beats a thrown export. Pure enough to test:
 *  `parseDataImage` is the half that does the parsing. */
export function parseDataImage(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z+]+);base64,([\s\S]+)$/i.exec(src);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/jpg") return null;
  return { mime, bytes: base64ToBytes(m[2]) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function embedDataImage(doc: any, src: string): Promise<any | null> {
  const parsed = parseDataImage(src);
  if (!parsed) return null;
  return parsed.mime === "image/png" ? doc.embedPng(parsed.bytes) : doc.embedJpg(parsed.bytes);
}

export async function pdfBytesFromBlocks(blocks: Block[], title: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(title));
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const ink = rgb(0.09, 0.13, 0.05);
  const faint = rgb(0.6, 0.62, 0.56);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ensure = (need: number) => {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const drawLines = (lines: Seg[][], size: number, indent = 0, color = ink) => {
    const lineH = size * 1.4;
    for (const line of lines) {
      ensure(lineH);
      y -= lineH;
      let x = MARGIN + indent;
      for (const seg of line) {
        page.drawText(seg.text, { x, y, size: seg.size, font: seg.font, color });
        x += seg.font.widthOfTextAtSize(seg.text, seg.size);
      }
    }
  };

  for (const block of blocks) {
    if (block.type === "hr") {
      ensure(16);
      y -= 8;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: faint });
      y -= 8;
      continue;
    }
    if (block.type === "heading") {
      const size = HEADING_SIZE[block.level] ?? 12;
      y -= block.level <= 2 ? 12 : 8;
      const bold = block.runs.map((r) => ({ ...r, bold: true }));
      drawLines(layoutRuns(bold, size, fonts, CONTENT_W), size);
      y -= 4;
      continue;
    }
    if (block.type === "quote") {
      const italic = block.runs.map((r) => ({ ...r, italic: true }));
      drawLines(layoutRuns(italic, 11, fonts, CONTENT_W - 16), 11, 16, faint);
      y -= 6;
      continue;
    }
    if (block.type === "code") {
      for (const raw of block.text.split("\n")) {
        drawLines(layoutRuns([{ text: raw || " ", code: true }], 9.5, fonts, CONTENT_W - 12), 9.5, 12, faint);
      }
      y -= 6;
      continue;
    }
    if (block.type === "list") {
      block.items.forEach((item, i) => {
        const marker = block.ordered ? `${i + 1}.` : "•";
        ensure(11 * 1.4);
        // Draw the marker on the first line, then the wrapped item text indented.
        const lines = layoutRuns(item, 11, fonts, CONTENT_W - 22);
        const firstY = y - 11 * 1.4;
        page.drawText(marker, { x: MARGIN + 4, y: firstY, size: 11, font: fonts.regular, color: ink });
        drawLines(lines, 11, 22);
      });
      y -= 6;
      continue;
    }
    if (block.type === "image") {
      // A generated chart. pdf-lib embeds PNG/JPEG only, and the src is always a `data:`
      // URI — anything else (webp/svg) is SKIPPED rather than drawn as a broken box.
      const embedded = await embedDataImage(doc, block.src).catch(() => null);
      if (embedded) {
        const w = Math.min(CONTENT_W, embedded.width);
        const h = (embedded.height / embedded.width) * w;
        // A figure taller than a page is scaled to fit one, never clipped.
        const maxH = PAGE_H - MARGIN * 2;
        const scale = h > maxH ? maxH / h : 1;
        ensure(h * scale + 6);
        y -= h * scale + 6;
        page.drawImage(embedded, {
          x: MARGIN + (CONTENT_W - w * scale) / 2,
          y,
          width: w * scale,
          height: h * scale,
        });
        y -= 6;
      }
      continue;
    }
    if (block.type === "table") {
      // No grid here (the HTML→PDF path draws one) — a tab-separated line per row, so no
      // cell content is lost on the platforms that fall back to this exporter.
      for (const runs of tableRowRuns(block)) drawLines(layoutRuns(runs, 11, fonts, CONTENT_W), 11);
      y -= 8;
      continue;
    }
    // paragraph
    drawLines(layoutRuns(block.runs, 11, fonts, CONTENT_W), 11);
    y -= 8;
  }

  return doc.save();
}
