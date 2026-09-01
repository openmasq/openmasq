/**
 * Turns the ALREADY-RENDERED Markdown DOM of a `DocumentCard` body into a small,
 * format-agnostic block model, consumed by the PDF (`documentPdf.ts`) and DOCX
 * (`documentDocx.ts`) exporters. Walking the rendered DOM (rather than re-parsing
 * the Markdown source) means the export matches exactly what the user sees — and it
 * reads the redaction `<mark>`s via their `data-real` attribute — NOT their displayed
 * text: the exported file must carry the REAL un-redacted value whatever a mark happens
 * to render (never sent back to the model).
 *
 * Pure w.r.t. its input node (no side effects); unit-tested against a jsdom tree.
 */

import { frenchSpacing } from "./microTypography";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { type: "heading"; level: number; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "quote"; runs: Run[] }
  | { type: "list"; ordered: boolean; items: Run[][] }
  | { type: "code"; text: string }
  | { type: "table"; rows: Run[][][]; head: boolean }
  | { type: "image"; src: string; alt?: string; name?: string }
  | { type: "hr" };

/** An `<img>` the renderer already resolved to INLINE bytes. Only a `data:` src is taken:
 *  the print window has no network (and neither has an offline export), so a remote URL
 *  could not be embedded anyway — it is dropped rather than shipped as a broken box.
 *  `data-file` (set by `markdown/blocks/MarkdownImage.tsx`) names the stored file, which is
 *  what lets {@link resolveImageBlocks} swap in the full-resolution original for print. */
function collectImage(img: Element, out: Block[]): void {
  const src = img.getAttribute("src") ?? "";
  if (!src.startsWith("data:image/")) return;
  out.push({
    type: "image",
    src,
    alt: img.getAttribute("alt") || undefined,
    name: img.getAttribute("data-file") || undefined,
  });
}

/** Upgrade every image block to its FULL-resolution original before an export. On-screen
 *  previews are downscaled (768 px) to keep the thread light; a chart embedded at that size
 *  prints soft. Best-effort per image: a resolver miss keeps the preview, so the figure is
 *  never LOST — only plainer. */
export async function resolveImageBlocks(
  blocks: Block[],
  load: ((name: string) => Promise<string | null>) | undefined,
): Promise<Block[]> {
  if (!load || !blocks.some((b) => b.type === "image" && b.name)) return blocks;
  return Promise.all(
    blocks.map(async (b) => {
      if (b.type !== "image" || !b.name) return b;
      const full = await load(b.name).catch(() => null);
      return full ? { ...b, src: full } : b;
    }),
  );
}

/** A table's cells as ONE tab-separated line per row — the shape the two flat exporters
 *  (pdf-lib, DOCX) fall back to, since neither draws a grid. Shared so they can't drift. */
export function tableRowRuns(block: { rows: Run[][][] }): Run[][] {
  return block.rows.map((cells) => [{ text: cells.map((c) => runsText(c).trim()).join("\t") }]);
}

const runsText = (runs: Run[]): string => runs.map((r) => r.text).join("");

/** Walk a rendered `.md` element's children into blocks. */
export function blocksFromElement(root: Element | null | undefined): Block[] {
  const blocks: Block[] = [];
  if (root) for (const child of Array.from(root.children)) collectBlock(child, blocks);
  return blocks;
}

function collectBlock(el: Element, out: Block[]): void {
  const tag = el.tagName.toUpperCase();
  if (/^H[1-6]$/.test(tag)) {
    out.push({ type: "heading", level: Number(tag[1]), runs: runsOf(el) });
    return;
  }
  switch (tag) {
    case "P": {
      const runs = runsOf(el);
      if (runs.some((r) => r.text.trim())) out.push({ type: "paragraph", runs });
      // A figure the model referenced (`![](chart.png)`) lives in its own paragraph —
      // emitted AFTER any text of that paragraph (the common case is image-only).
      for (const img of Array.from(el.querySelectorAll("img"))) collectImage(img, out);
      return;
    }
    case "IMG":
      collectImage(el, out);
      return;
    case "BLOCKQUOTE":
      out.push({ type: "quote", runs: runsOf(el) });
      return;
    case "UL":
    case "OL": {
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toUpperCase() === "LI")
        .map((li) => runsOf(li));
      if (items.length) out.push({ type: "list", ordered: tag === "OL", items });
      return;
    }
    case "HR":
      out.push({ type: "hr" });
      return;
    case "PRE": {
      const text = realTextContent(el).replace(/\n+$/, "");
      if (text) out.push({ type: "code", text });
      return;
    }
    case "TABLE": {
      // Kept as a REAL table: `documentHtml.ts` draws a grid, and the two flat exporters
      // flatten it back to tab-separated lines (`tableRowRuns`) so nothing is lost there.
      const rows: Run[][][] = [];
      for (const row of Array.from(el.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("th,td")).map((c) => runsOf(c));
        if (cells.some((c) => c.some((r) => r.text.trim()))) rows.push(cells);
      }
      // A GFM table always has a header row; a bare `<table>` (raw HTML) may not.
      if (rows.length) out.push({ type: "table", rows, head: !!el.querySelector("thead th, tr th") });
      return;
    }
    default:
      // A wrapper the renderer introduced (`.md-code`, `.md-table-wrap`, `.md-gallery`,
      // a span…): recurse so its real block children are still captured.
      for (const child of Array.from(el.children)) collectBlock(child, out);
      // A leaf wrapper with only text (rare) → treat as a paragraph.
      if (!el.children.length) {
        const runs = runsOf(el);
        if (runs.some((r) => r.text.trim())) out.push({ type: "paragraph", runs });
      }
  }
}

/** Inline runs of an element: text with bold/italic/code flags from the nested
 *  `<strong>`/`<em>`/`<code>` (links + redaction `<mark>`s contribute their text). */
export function runsOf(el: Node): Run[] {
  const out: Run[] = [];
  walkInline(el, {}, out);
  // French micro-typography applies HERE — the one seam the three
  // exports share — and never to a `code` run, where a space is a character.
  return mergeRuns(out).map((r) => (r.code ? r : { ...r, text: frenchSpacing(r.text) }));
}

/** `textContent` that reads a redaction `<mark>`'s `data-real` instead of its DISPLAYED
 *  text — the token display shows `[PERSON1]`, the export must carry the real value. */
function realTextContent(node: Node): string {
  if (node.nodeType === 3 /* text */) return node.textContent ?? "";
  if (node.nodeType !== 1 /* element */) return "";
  const el = node as Element;
  if (el.tagName.toUpperCase() === "MARK") {
    const real = el.getAttribute("data-real");
    if (real) return real;
  }
  let s = "";
  for (const c of Array.from(el.childNodes)) s += realTextContent(c);
  return s;
}

function walkInline(node: Node, style: Omit<Run, "text">, out: Run[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* text */) {
      const text = child.textContent ?? "";
      if (text) out.push({ text, ...style });
      continue;
    }
    if (child.nodeType !== 1 /* element */) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === "BR") {
      out.push({ text: "\n", ...style });
      continue;
    }
    if (tag === "MARK") {
      // A redaction mark: export its REAL value whatever the display mode shows.
      const real = el.getAttribute("data-real");
      if (real) {
        out.push({ text: real, ...style });
        continue;
      }
    }
    const next = { ...style };
    if (tag === "STRONG" || tag === "B") next.bold = true;
    else if (tag === "EM" || tag === "I") next.italic = true;
    else if (tag === "CODE") next.code = true;
    walkInline(el, next, out);
  }
}

/** Merge adjacent runs with identical styling so the output stays compact. */
function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.code === !!r.code) {
      prev.text += r.text;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}
