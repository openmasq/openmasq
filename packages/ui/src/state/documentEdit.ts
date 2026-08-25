/**
 * Locate/replace a ```document fence's INNER text inside a message's markdown
 * content — the persistence half of the DocumentCard editor. Pure string logic:
 * the content is the un-redacted source of truth (the .docx/.pdf are derived at
 * download time), so editing the document IS editing this fence.
 *
 * Matching is by EXACT inner text modulo the trailing newline: the rendered code
 * node's text (what DocumentCard holds) carries a final "\n" the raw slice may or
 * may not, and nothing else differs. Everything around the fence is preserved
 * byte-for-byte. Ambiguity (two identical fences) resolves to the FIRST — they
 * are the same document, replacing either reads identically.
 */

interface FenceSpan {
  /** Offset of the first char of the inner text (line after ```document). */
  start: number;
  /** Offset one past the inner text's last char (before the closing fence line). */
  end: number;
  inner: string;
}

/** Every ```document fence in `content`, in order. Tolerates an unclosed final
 *  fence (still streaming / model forgot the close): inner runs to the end. */
export function documentFences(content: string): FenceSpan[] {
  const spans: FenceSpan[] = [];
  const open = /^```document[ \t]*\r?\n/gm;
  let m: RegExpExecArray | null;
  while ((m = open.exec(content))) {
    const start = m.index + m[0].length;
    const close = /^```[ \t]*$/m.exec(content.slice(start));
    const end = close ? start + close.index : content.length;
    spans.push({ start, end, inner: content.slice(start, end) });
    open.lastIndex = end;
  }
  return spans;
}

const stripTrailingNl = (s: string): string => s.replace(/\r?\n$/, "");

/**
 * Replace the fence whose inner text matches `oldText` with `newText`. Returns
 * the new content, or null when no fence matches (the caller treats null as
 * "don't touch the message" — fail closed, never a guessy partial write).
 */
export function replaceDocumentInContent(
  content: string,
  oldText: string,
  newText: string,
): string | null {
  const want = stripTrailingNl(oldText);
  const fence = documentFences(content).find((f) => stripTrailingNl(f.inner) === want);
  if (!fence) return null;
  // Keep the closing fence on its own line whatever the editor left behind.
  const inner = stripTrailingNl(newText) + "\n";
  return content.slice(0, fence.start) + inner + content.slice(fence.end);
}
