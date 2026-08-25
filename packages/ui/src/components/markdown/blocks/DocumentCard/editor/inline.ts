/**
 * INLINE marks, both directions: the small markdown subset a written document actually
 * uses (`**gras**`, `*italique*`, `` `code` ``, `[texte](url)`) ⇄ real DOM nodes.
 *
 * It exists because the editor is WYSIWYG over a markdown SOURCE OF TRUTH: the stored
 * document stays markdown (the repo never stores a format it would have to convert
 * back — `pages/Competences/promptFormat.ts` states the rule), so every keystroke has
 * to survive md → DOM → md unchanged. `inline.test.ts` pins that round-trip, which is
 * the only thing standing between "the user typed it" and "the file kept it".
 *
 * Deliberately NOT a markdown parser: it renders what people write in a letter or a
 * report. Anything it does not recognise stays literal text, so an unsupported
 * construct is preserved verbatim rather than mangled — the failure mode has to be
 * "it looks like source" and never "it silently disappeared".
 */

/** `\` before a mark character means "this is literal" — kept on the way back. */
const ESCAPABLE = /[\\`*_[\]]/;

interface Tok {
  kind: "text" | "strong" | "em" | "code" | "link";
  text: string;
  href?: string;
}

/**
 * Split inline markdown into tokens. Single-pass, leftmost-longest: `**` is tried
 * before `*`, so `**gras**` never reads as two italics around `gras`.
 */
export function tokenizeInline(md: string): Tok[] {
  const out: Tok[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ kind: "text", text: buf });
    buf = "";
  };
  while (i < md.length) {
    const c = md[i];
    if (c === "\\" && i + 1 < md.length && ESCAPABLE.test(md[i + 1])) {
      buf += md[i + 1];
      i += 2;
      continue;
    }
    const rest = md.slice(i);
    // `[texte](url)` — the href is taken raw; the renderer never fetches it.
    const link = /^\[([^\]\n]*)\]\(([^)\s]*)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: "link", text: link[1], href: link[2] });
      i += link[0].length;
      continue;
    }
    // `code` first: inside a code span, `*` is literal.
    const code = /^`([^`\n]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: "code", text: code[1] });
      i += code[0].length;
      continue;
    }
    const strong = /^\*\*([^\n]+?)\*\*/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: "strong", text: strong[1] });
      i += strong[0].length;
      continue;
    }
    const em = /^([*_])(?!\s)([^\n]+?)(?<!\s)\1/.exec(rest);
    if (em) {
      flush();
      out.push({ kind: "em", text: em[2] });
      i += em[0].length;
      continue;
    }
    buf += c;
    i += 1;
  }
  flush();
  return out;
}

/** Escape the characters that would otherwise be READ as marks on the way back in. */
export function escapeInline(text: string): string {
  return text.replace(/([\\`*_])/g, "\\$1").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Inline markdown → DOM nodes, appended into `doc`'s ownership. */
export function inlineToNodes(md: string, doc: Document): Node[] {
  return tokenizeInline(md).map((t) => {
    if (t.kind === "text") return doc.createTextNode(t.text);
    if (t.kind === "code") {
      const el = doc.createElement("code");
      el.textContent = t.text;
      return el;
    }
    if (t.kind === "link") {
      const el = doc.createElement("a");
      el.setAttribute("href", t.href ?? "");
      // The editor must not navigate on click — the card's read view owns links.
      el.setAttribute("data-md-link", "1");
      for (const n of inlineToNodes(t.text, doc)) el.appendChild(n);
      return el;
    }
    const el = doc.createElement(t.kind === "strong" ? "strong" : "em");
    for (const n of inlineToNodes(t.text, doc)) el.appendChild(n);
    return el;
  });
}

/**
 * DOM → inline markdown. Reads the tags a browser actually produces for ⌘B/⌘I
 * (`<b>`/`<strong>`, `<i>`/`<em>`), not just the ones we emit — `document.execCommand`
 * and a paste from another app both pick their own, and treating one as unknown would
 * DROP the user's formatting silently.
 */
export function inlineFromNode(node: Node): string {
  if (node.nodeType === 3 /* text */) return escapeInline(node.nodeValue ?? "");
  if (node.nodeType !== 1 /* element */) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map(inlineFromNode).join("");
  if (tag === "br") return "\n";
  if (tag === "code") return "`" + (el.textContent ?? "") + "`";
  if (tag === "strong" || tag === "b") {
    const inner = kids();
    return inner.trim() ? `**${inner}**` : inner;
  }
  if (tag === "em" || tag === "i") {
    const inner = kids();
    return inner.trim() ? `*${inner}*` : inner;
  }
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    return href ? `[${kids()}](${href})` : kids();
  }
  return kids();
}
