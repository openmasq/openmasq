import type { Block, Run } from "./documentBlocks";
import type { PdfDocument } from "../../host/platform";
import { DOC_BG, DOC_GRID, DOC_INK, DOC_LIME, DOC_MUTED, DOC_STRIPE } from "./documentTheme";
import { BRAND } from "@openmasq/branding";

/**
 * Turns a document's `Block[]` into the HTML + PRINT stylesheet the platform typesets to
 * PDF (`Host.pdf.renderHtml`). This is the pretty path: a real layout engine gives the
 * brand webfont at its true weights, full Unicode, real tables, page-breaking and repeated
 * table headers — none of which `documentPdf.ts` (pdf-lib, WinAnsi, 14 standard fonts) can
 * do. That exporter stays the fallback when the host slot is absent.
 *
 * Pure + unit-tested. Two rules that are load-bearing rather than cosmetic:
 *
 *  - **Every text run is ESCAPED.** The blocks hold the user's REAL un-redacted values,
 *    text — not markup. The page is rendered with scripting off behind
 *    `default-src 'none'` (`apps/desktop/src/main/pdf/`), so an escape miss is not an XSS;
 *    it would simply corrupt the document. Escape anyway: markup in a value must PRINT.
 *  - **The stylesheet is a standalone print document, not app DOM** — which is why CSS
 *    lives here as a string rather than in `styles/` (rule 6 governs the app's own DOM,
 *    and this sheet must travel INSIDE the generated file, unaffected by the four themes).
 *    Its palette is `documentTheme.ts`, shared-by-parity-test with the sandbox's PDF/PPTX.
 */

/** HTML-escape a text run (real user data — a `<` in a value must print, not parse). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline runs → escaped HTML with the three marks the block model carries. An explicit
 *  `\n` inside a run (a Markdown hard break) becomes a `<br>`. */
function runsHtml(runs: Run[]): string {
  return runs
    .map((run) => {
      const text = escapeHtml(run.text).replace(/\n/g, "<br>");
      if (!text) return "";
      let out = text;
      if (run.code) out = `<code>${out}</code>`;
      if (run.italic) out = `<em>${out}</em>`;
      if (run.bold) out = `<strong>${out}</strong>`;
      return out;
    })
    .join("");
}

function tableHtml(block: Extract<Block, { type: "table" }>): string {
  const cells = (row: Run[][], tag: "th" | "td"): string =>
    row.map((cell) => `<${tag}>${runsHtml(cell)}</${tag}>`).join("");
  const [first, ...rest] = block.rows;
  // `thead` is what makes the header REPEAT on every page of a long table.
  const head = block.head ? `<thead><tr>${cells(first, "th")}</tr></thead>` : "";
  const bodyRows = block.head ? rest : block.rows;
  const body = bodyRows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("");
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

function blockHtml(block: Block): string {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 6);
      return `<h${level}>${runsHtml(block.runs)}</h${level}>`;
    }
    case "quote":
      return `<blockquote>${runsHtml(block.runs)}</blockquote>`;
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${runsHtml(item)}</li>`).join("")}</${tag}>`;
    }
    case "table":
      return tableHtml(block);
    case "image":
      // `src` is always a `data:` URI (`documentBlocks.ts` takes no other kind) — the print
      // session has no network, and the CSP permits `img-src data:` and nothing else.
      return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? "")}"></figure>`;
    case "hr":
      return "<hr>";
    default:
      return `<p>${runsHtml(block.runs)}</p>`;
  }
}

/**
 * The print stylesheet. `@page` owns the paper (the platform passes
 * `preferCSSPageSize`), and the bottom margin leaves room for the running footer the
 * platform draws. Sizes are in `pt`/`mm` on purpose — this sheet never meets a screen.
 * The brand-named face is the one the platform inlines as a `data:` font; the fallbacks cover
 * an install with no bundled font (and the mono stack is always a system one — only the
 * text face is bundled).
 */
export const DOCUMENT_PRINT_CSS = `
*{box-sizing:border-box}
@page{size:A4;margin:18mm 16mm 20mm}
html,body{margin:0;padding:0}
body{background:${DOC_BG};color:${DOC_INK};font-family:${BRAND.name},-apple-system,system-ui,"Segoe UI",sans-serif;
  font-size:10.5pt;line-height:1.55;orphans:3;widows:3;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid;font-weight:700;line-height:1.25;margin:0}
h1{font-size:23pt;letter-spacing:-.01em;margin:0 0 3mm}
h1::after{content:"";display:block;width:42mm;height:1.1mm;background:${DOC_LIME};margin-top:3mm}
h1~h1{margin-top:10mm}
h2{font-size:14pt;margin:7mm 0 2mm;padding-left:4mm;position:relative}
h2::before{content:"";position:absolute;left:0;top:.9mm;width:1.6mm;height:4.6mm;background:${DOC_LIME}}
h3{font-size:11.5pt;margin:5mm 0 1.5mm}
h4,h5,h6{font-size:10.5pt;margin:4mm 0 1mm;color:${DOC_MUTED}}
p{margin:0 0 2.6mm}
strong{font-weight:700}
em{font-style:italic}
a{color:${DOC_INK};text-decoration:underline;text-decoration-color:${DOC_GRID}}
ul,ol{margin:0 0 2.6mm;padding-left:6mm}
li{margin:0 0 1mm;break-inside:avoid}
li::marker{color:${DOC_MUTED}}
blockquote{margin:0 0 3mm;padding:1mm 0 1mm 4mm;border-left:.8mm solid ${DOC_LIME};color:${DOC_MUTED};font-style:italic}
hr{border:0;border-top:.25mm solid ${DOC_GRID};margin:5mm 0}
code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:9pt;
  background:${DOC_STRIPE};padding:.3mm .8mm;border-radius:.8mm}
pre{margin:0 0 3mm;padding:2.5mm 3mm;background:${DOC_STRIPE};border-left:.8mm solid ${DOC_GRID};
  border-radius:1mm;break-inside:avoid}
pre code{background:none;padding:0;font-size:8.5pt;white-space:pre-wrap;word-break:break-word}
table{border-collapse:collapse;width:100%;margin:0 0 3.5mm;font-size:9.5pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:${DOC_LIME};color:${DOC_INK};font-weight:700;text-align:left}
th,td{padding:1.5mm 2mm;border-bottom:.25mm solid ${DOC_GRID};vertical-align:top}
tbody tr:nth-child(odd){background:${DOC_STRIPE}}
figure{margin:0 0 4mm;text-align:center;break-inside:avoid}
/* A figure must not be split across pages, and must not push itself onto a second one:
   the cap is the printable height minus a couple of lines of context. */
img{max-width:100%;max-height:200mm;height:auto}
`.trim();

/**
 * Build the platform request for a document. `title` is plain text (PDF metadata + the
 * running footer); the visible title is the document's own first heading, as on screen.
 */
export function documentHtmlFromBlocks(blocks: Block[], title: string): PdfDocument {
  return {
    html: blocks.map(blockHtml).join("\n"),
    css: DOCUMENT_PRINT_CSS,
    title,
  };
}
