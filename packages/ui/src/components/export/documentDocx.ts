import { tableRowRuns, type Block, type Run } from "./documentBlocks";
import { DOC_FONT_OFFICE, DOC_FONT_OFFICE_FALLBACK } from "./documentTheme";

/**
 * Renders a document's `Block[]` to a REAL `.docx` (OpenXML WordprocessingML),
 * zipped with fflate — fully client-side (no backend, CSP-safe), so the export is
 * instant and on-device. fflate is lazy-`import()`ed (external in tsup) so it
 * code-splits out of the main bundle. Formatting is inlined on each run (bold /
 * italic / monospace + heading sizes); the styles part carries ONLY the document defaults
 * (Aptos 11 pt) and the font table names Calibri as Aptos's substitute, so an Office older
 * than 2023, LibreOffice or Pages never falls back to its own serif default. Pure builders
 * (`documentXml`) and the zipped parts are unit-tested.
 */

const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CODE_PPR = '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>';
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
        // Tight lines: the default paragraph spacing would gap every line of a listing.
        .map((line) => para([{ text: line || " ", code: true }], CODE_PPR))
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
    XML_HEAD +
    `<w:document xmlns:w="${NS}"><w:body>${body}${sect}</w:body></w:document>`
  );
}

/** `word/styles.xml`: the document defaults only — the body face on all four script slots
 *  (Latin, high-ANSI, East-Asian, complex) and 11 pt, which headings' explicit sizes sit
 *  above as before. No named heading styles: the runs carry their own formatting. */
function stylesXml(): string {
  const f = DOC_FONT_OFFICE;
  return (
    XML_HEAD +
    `<w:styles xmlns:w="${NS}"><w:docDefaults>` +
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>` +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    "</w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    "</w:styles>"
  );
}

/** One `w:font` entry. Child order is the schema's (altName, panose1, charset, family, pitch). */
function fontEntry(name: string, panose: string, family: string, pitch: string, alt?: string): string {
  return (
    `<w:font w:name="${name}">` +
    (alt ? `<w:altName w:val="${alt}"/>` : "") +
    `<w:panose1 w:val="${panose}"/><w:charset w:val="00"/>` +
    `<w:family w:val="${family}"/><w:pitch w:val="${pitch}"/></w:font>`
  );
}

/** `word/fontTable.xml`: Aptos with Calibri as its declared substitute (`w:altName`), plus
 *  Calibri itself and Consolas for code runs, each with its PANOSE so a reader without the
 *  face picks a close sans / monospace. */
function fontTableXml(): string {
  return (
    XML_HEAD +
    `<w:fonts xmlns:w="${NS}">` +
    fontEntry(DOC_FONT_OFFICE, "020B0004020202020204", "swiss", "variable", DOC_FONT_OFFICE_FALLBACK) +
    fontEntry(DOC_FONT_OFFICE_FALLBACK, "020F0502020204030204", "swiss", "variable") +
    fontEntry("Consolas", "020B0609020204030204", "modern", "fixed") +
    "</w:fonts>"
  );
}

const CONTENT_TYPES =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
  "</Types>";

const RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

/** `word/_rels/document.xml.rels`: the main part's links to its styles and font table. */
const DOCUMENT_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
  "</Relationships>";

/** Build a `.docx` (zip) from a block list. fflate lazy-loaded. */
export async function docxBytesFromBlocks(blocks: Block[]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "word/document.xml": strToU8(documentXml(blocks)),
      "word/_rels/document.xml.rels": strToU8(DOCUMENT_RELS),
      "word/styles.xml": strToU8(stylesXml()),
      "word/fontTable.xml": strToU8(fontTableXml()),
    },
    { level: 6 },
  );
}
