import { inlineFromNode, inlineToNodes } from "./inline";

/**
 * BLOCK structure, both directions: markdown ⇄ the DOM the editor is contentEditable
 * over. Paragraphs, `#`/`##`/`###`, `-` bullets, `1.` ordered, `>` quotes, fenced code.
 *
 * The editor keeps ONE contentEditable over the whole document rather than one per
 * block, on purpose: Enter, Backspace-merge, multi-block selection, drag and paste are
 * then the browser's own — re-implementing them per block is where hand-rolled editors
 * become subtly wrong. The price is that the browser also invents DOM (a bare `<div>`
 * on Enter, a stray `<br>`, a `<span style>` on paste), so `domToMarkdown` treats the
 * tree as UNTRUSTED shape: it recognises what it knows, and anything else degrades to
 * a paragraph of its text instead of vanishing.
 */

export type BlockType = "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote" | "code";

export interface Block {
  type: BlockType;
  /** Inline markdown for the block's own line (empty for a blank paragraph). A `p` or a
   *  `quote` may hold several lines: markdown's SOFT WRAP is one block, not one per line. */
  text: string;
  /** A fenced block's info string (```js). Dropping it cost the card its syntax
   *  highlighting — `SyntaxHighlight` colours from the fence language. */
  lang?: string;
  /** An ordered item's own number. Emitting a constant `1.` restarted at 1 any list the
   *  author began at 3 — CommonMark reads the FIRST item's number for the whole run. */
  n?: number;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```(.*)$/;
/** A line the editor does not model (a nested item, an indented code block) — kept
 *  VERBATIM, which is the failure mode this module promises for what it doesn't support. */
const INDENTED = /^\s+\S/;

/** Markdown → blocks. Line-oriented, with ONE exception that markdown forces: a plain
 *  line following another plain line CONTINUES its paragraph (a soft wrap), it does not
 *  open a new one. Splitting there is what turned « Bonjour Madame,\nSuite à notre
 *  échange. » — one paragraph — into two on the first save, since `blocksToMarkdown`
 *  puts a blank line between blocks. The soft break is KEPT inside the block's text: it
 *  renders as a space (no `remark-breaks` in the card's renderer), which is exactly what
 *  it did before the edit, and the source comes back byte-identical. */
export function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let inCode = false;
  for (const line of lines) {
    const fence = FENCE.exec(line.trim());
    if (fence) {
      inCode = !inCode;
      // The info string rides on the OPENING fence only; the closing one carries none.
      if (inCode) out.push({ type: "code", text: "", lang: fence[1].trim() || undefined });
      continue;
    }
    if (inCode) {
      const last = out[out.length - 1];
      if (last?.type === "code") last.text = last.text ? `${last.text}\n${line}` : line;
      else out.push({ type: "code", text: line });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      out.push({ type: (`h${h[1].length}` as BlockType), text: h[2] });
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      out.push({ type: "ul", text: b[1] });
      continue;
    }
    const o = ORDERED.exec(line);
    if (o) {
      out.push({ type: "ol", text: o[2], n: Number(o[1]) });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      // Same soft-wrap rule as a paragraph: `> a` then `> b` is ONE citation, and
      // splitting it produced two quote blocks with a gap between them.
      const last = out[out.length - 1];
      if (last?.type === "quote" && last.text !== "") last.text += `\n${q[1]}`;
      else out.push({ type: "quote", text: q[1] });
      continue;
    }
    // A blank line between two paragraphs is structure, not content: it disappears
    // here and comes back in `blocksToMarkdown`, so a round-trip can't grow blank
    // lines on every save (the classic drift that eventually reflows the document).
    if (line.trim() === "") {
      if (out.length && out[out.length - 1].text !== "") out.push({ type: "p", text: "" });
      continue;
    }
    // Continuation of the paragraph above (soft wrap) — a blank line pushed a `p` with
    // EMPTY text, and any other construct is a different type, so this one condition
    // distinguishes "same paragraph" from "new one" without tracking extra state.
    const prev = out[out.length - 1];
    if (prev?.type === "p" && prev.text !== "") prev.text += `\n${line}`;
    else out.push({ type: "p", text: line });
  }
  while (out.length && out[out.length - 1].type === "p" && out[out.length - 1].text === "") out.pop();
  return out.length ? out : [{ type: "p", text: "" }];
}

const PREFIX: Record<BlockType, string> = {
  p: "",
  h1: "# ",
  h2: "## ",
  h3: "### ",
  ul: "- ",
  ol: "1. ",
  quote: "> ",
  code: "",
};

/** Blocks → markdown, re-inserting the blank lines the structure implies. */
export function blocksToMarkdown(blocks: Block[]): string {
  const lines: string[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "code") {
      lines.push("```" + (b.lang ?? ""), ...b.text.split("\n"), "```");
      return;
    }
    // A quote's marker belongs to EVERY one of its lines; a paragraph's soft wrap takes
    // no prefix at all. An ordered item keeps the number it was authored with.
    if (b.type === "quote") lines.push(...b.text.split("\n").map((l) => `> ${l}`));
    else if (b.type === "ol") lines.push(`${b.n ?? 1}. ${b.text}`);
    else lines.push(PREFIX[b.type] + b.text);
    // A blank line after a paragraph/heading/quote when the next block is not a list
    // item of the same kind — this is what makes the output read as markdown rather
    // than as one run-on block.
    const next = blocks[i + 1];
    if (!next) return;
    const listRun = (b.type === "ul" || b.type === "ol") && next.type === b.type;
    // …and NEVER before an indented line. It is a construct this editor does not model
    // (a nested item, an indented code block) that survives as literal text — a blank
    // line inserted in front of it makes the list loose or detaches the nesting.
    if (!listRun && !(b.type === "p" && b.text === "") && !INDENTED.test(next.text)) lines.push("");
  });
  // Only BLANK lines are trimmed off the ends — `.trim()` also ate the leading spaces of
  // a document that opens on an indented line, turning an indented code block into a
  // paragraph.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
}

const TAG: Record<BlockType, string> = {
  p: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  ul: "li",
  ol: "li",
  quote: "blockquote",
  code: "pre",
};

/** Blocks → the editable DOM. Each block is ONE element carrying `data-b` (its type),
 *  which is what `domToMarkdown` reads back — never the tag alone, so a browser that
 *  swaps `<p>` for `<div>` on Enter still round-trips. */
export function blocksToDom(blocks: Block[], doc: Document): DocumentFragment {
  const frag = doc.createDocumentFragment();
  for (const b of blocks) {
    const el = doc.createElement(TAG[b.type]);
    el.setAttribute("data-b", b.type);
    // The fence language and an ordered item's number are not in the text, so they ride
    // as attributes or `domToMarkdown` reads them back as absent — which is how the
    // highlighting and a list starting at 3 were lost on the first save.
    if (b.lang) el.setAttribute("data-lang", b.lang);
    if (b.type === "ol" && b.n !== undefined) el.setAttribute("data-n", String(b.n));
    if (b.type === "code") el.textContent = b.text;
    else {
      const nodes = inlineToNodes(b.text, doc);
      if (nodes.length) for (const n of nodes) el.appendChild(n);
      // An empty block still needs a line box or the caret cannot land in it.
      else el.appendChild(doc.createElement("br"));
    }
    frag.appendChild(el);
  }
  return frag;
}

/** The editable DOM → markdown. Reads `data-b` first, then falls back to the tag —
 *  and finally to a paragraph, so unknown markup keeps its TEXT. */
export function domToMarkdown(root: Element): string {
  const blocks: Block[] = [];
  for (const child of Array.from(root.children)) {
    const attr = child.getAttribute("data-b") as BlockType | null;
    const tag = child.tagName.toLowerCase();
    const type: BlockType =
      attr && attr in PREFIX
        ? attr
        : tag === "h1" || tag === "h2" || tag === "h3"
          ? (tag as BlockType)
          : tag === "li"
            ? "ul"
            : tag === "blockquote"
              ? "quote"
              : tag === "pre"
                ? "code"
                : "p";
    const lang = child.getAttribute("data-lang") || undefined;
    if (type === "code") {
      blocks.push({ type, text: child.textContent ?? "", lang });
      continue;
    }
    const text = Array.from(child.childNodes).map(inlineFromNode).join("").replace(/\n+$/, "");
    const rawN = child.getAttribute("data-n");
    const n = type === "ol" && rawN && /^\d+$/.test(rawN) ? Number(rawN) : undefined;
    // `<br>` is how an empty block holds its line box — it must not become a literal
    // newline in the source.
    blocks.push({ type, text: text === "\n" ? "" : text, n });
  }
  return blocksToMarkdown(blocks.length ? blocks : [{ type: "p", text: "" }]);
}
