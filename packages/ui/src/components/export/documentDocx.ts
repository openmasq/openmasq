import { tableRowRuns, type Block, type Run } from "./documentBlocks";

/**
 * Renders a document's `Block[]` to a REAL `.docx` (OpenXML WordprocessingML),
 * zipped with fflate — fully client-side (no backend, CSP-safe), so the export is
 * instant and on-device. fflate is lazy-`import()`ed (external in tsup) so it
 * code-splits out of the main bundle. Formatting is inlined on each run (bold /
 * italic / monospace + heading sizes) — no separate styles part to keep the package
 * minimal and valid. Pure builders (`documentXml`) are unit-tested.
 */

const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const HEADING_HALF_PT: Record<number, number> = { 1: 44, 2: 34, 3: 28, 4: 24, 5: 24, 6: 24 };

/** XML-escape + strip disallowed control chars (keep \t and \n, handled as breaks). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function runXml(run: Run, opts: { size?: number; bold?: boolean; italic?: boolean } = {}): string {
  const bold = run.bold || opts.bold;
  const italic = run.italic || opts.italic;
  const props =
    (bold ? "<w:b/>" : "") +
    (italic ? "<w:i/>" : "") +
    (run.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "") +
    (opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "");
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : "";
  // Explicit newlines (from <br>) become <w:br/> within the run.
  const body = run.text
    .split("\n")
    .map((t, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${esc(t)}</w:t>`)
    .join("");
  return `<w:r>${rPr}${body}</w:r>`;
}

function para(runs: Run[], pPr = "", runOpts?: Parameters<typeof runXml>[1]): string {
  const inner = runs.length ? runs.map((r) => runXml(r, runOpts)).join("") : "<w:r><w:t/></w:r>";
  return `<w:p>${pPr}${inner}</w:p>`;
}

function blockXml(block: Block): string {
  switch (block.type) {
    case "heading": {
      const size = HEADING_HALF_PT[block.level] ?? 24;
      const pPr = `<w:pPr><w:spacing w:before="${block.level <= 2 ? 240 : 160}" w:after="80"/></w:pPr>`;
      return para(block.runs, pPr, { size, bold: true });
    }
    case "quote":
      return para(block.runs, '<w:pPr><w:ind w:left="360"/></w:pPr>', { italic: true });
    case "hr":
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D0D0"/></w:pBdr></w:pPr></w:p>';
    case "code":
      return block.text
        .split("\n")
        .map((line) => para([{ text: line || " ", code: true }]))
        .join("");
    case "list":
      return block.items
        .map((item, i) => {
          const marker: Run = { text: (block.ordered ? `${i + 1}.` : "•") + "\t" };
          const pPr = '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>';
          return para([marker, ...item], pPr);
        })
        .join("");
    case "image":
      // No media part in this minimal package (see the header): the figure's ALT text is
      // kept as an italic line so the reader knows one belongs here, rather than a silent
      // hole. The PDF paths embed the real image.
      return para([{ text: `[Image : ${block.alt || "figure"}]`, italic: true }]);
    case "table":
      // This exporter draws no grid (the HTML→PDF one does): one tab-separated paragraph
      // per row, so no cell content is lost.
      return tableRowRuns(block)
        .map((runs) => para(runs))
        .join("");
    default:
      return para(block.runs);
  }
}

/** The full `word/document.xml` for a block list. Pure — unit-tested. */
export function documentXml(blocks: Block[]): string {
  const body = blocks.map(blockXml).join("");
  const sect =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${NS}"><w:body>${body}${sect}</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

/** Build a `.docx` (zip) from a block list. fflate lazy-loaded. */
export async function docxBytesFromBlocks(blocks: Block[]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "word/document.xml": strToU8(documentXml(blocks)),
    },
    { level: 6 },
  );
}
