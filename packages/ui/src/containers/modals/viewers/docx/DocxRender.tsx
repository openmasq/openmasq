import type { JSX } from "react";
import type { DocxBlock, DocxCell, DocxDoc, DocxInline, DocxPara, DocxTable } from "./docxModel";
import { docBaseCss, groupBlocks, listItemCss, paraCss, runCss, type LaidOutBlock } from "./docxLayout";

// Model → React. Presentational: every value it renders was decided by `parseDocx`
// and shaped by `docxLayout`.
//
// There is NO `dangerouslySetInnerHTML` here, and there must never be: the tags below
// are the complete set a .docx can produce on screen, which is what lets this viewer
// skip a sanitiser entirely. See `docxModel.ts`.

function Inline({ item }: { item: DocxInline }) {
  if (item.kind === "image") {
    return (
      <img
        className="fv-docx-img"
        src={item.src}
        alt={item.alt ?? ""}
        // Runtime-computed per-item size from the document (the sanctioned inline-style
        // case, rule 6). Width only: height stays auto so a page-width cap keeps the
        // aspect ratio instead of squashing the image.
        style={item.widthPx ? { width: `${Math.round(item.widthPx)}px` } : undefined}
      />
    );
  }
  return <span style={runCss(item)}>{item.text}</span>;
}

function Inlines({ items }: { items: DocxInline[] }) {
  return (
    <>
      {items.map((item, i) => (
        <Inline key={i} item={item} />
      ))}
    </>
  );
}

function Para({ para }: { para: DocxPara }) {
  const style = paraCss(para);
  // An empty paragraph is a deliberate blank line in the document, so it must still
  // occupy one — an empty <p> collapses to nothing without it.
  const content = para.inlines.length ? <Inlines items={para.inlines} /> : <br />;
  if (para.headingLevel) {
    const Tag = `h${Math.min(6, Math.max(1, para.headingLevel))}` as keyof JSX.IntrinsicElements;
    return (
      <Tag className="fv-docx-h" style={style}>
        {content}
      </Tag>
    );
  }
  return (
    <p className="fv-docx-p" style={style}>
      {content}
    </p>
  );
}

function Cell({ cell }: { cell: DocxCell }) {
  return (
    <td className="fv-docx-td" colSpan={cell.colSpan} style={cell.background ? { background: cell.background } : undefined}>
      <Blocks blocks={cell.blocks} />
    </td>
  );
}

function Table({ table }: { table: DocxTable }) {
  return (
    <table className="fv-docx-table">
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <Cell key={j} cell={cell} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Block({ block }: { block: LaidOutBlock }) {
  if (block.kind === "table") return <Table table={block} />;
  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag className="fv-docx-list">
        {block.items.map((item, i) => (
          <li key={i} style={listItemCss(item)}>
            <Inlines items={item.inlines} />
          </li>
        ))}
      </Tag>
    );
  }
  return <Para para={block} />;
}

function Blocks({ blocks }: { blocks: DocxBlock[] }) {
  return (
    <>
      {groupBlocks(blocks).map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

/** The parsed document, rendered. The text is ordinary DOM text, so it is natively
 *  selectable — which is what lets the preview's manual "Redact" work on the
 *  document itself rather than on a flattened text tab. */
export function DocxRender({ doc }: { doc: DocxDoc }) {
  return (
    <div className="fv-docx" style={docBaseCss(doc.defaultStyle, doc.bodyWidthPx)}>
      <Blocks blocks={doc.blocks} />
    </div>
  );
}
