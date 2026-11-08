/**
 * The HTML entities that survive tag-stripping, decoded in ONE pass: each entity of the input is
 * read once, so `&amp;lt;` stays the text `&lt;` instead of becoming `<` on a second pass. The
 * one decoder of the product (Graph bodies, fetched pages, link previews). A numeric entity for
 * a control or out-of-range code point is kept as written.
 */
const ENTITY = /&(?:#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g;
const NAMED: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };

export function decodeHtmlEntities(s: string): string {
  return s.replace(ENTITY, (m) => {
    if (m[1] !== "#") return NAMED[m] ?? m;
    const cp = m[2] === "x" || m[2] === "X" ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10);
    if (!Number.isFinite(cp) || cp < 0x20 || cp > 0x10ffff) return m;
    try {
      return String.fromCodePoint(cp);
    } catch {
      return m;
    }
  });
}
