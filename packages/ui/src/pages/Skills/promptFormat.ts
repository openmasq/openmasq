/**
 * The markdown toolbar's text transforms — pure, so the modal only wires them.
 *
 * A compétence's prompt is TEXT: it is prepended to the model payload verbatim, so the
 * editor's job is to make markdown easy to type, never to store a different format that
 * has to be converted back (a conversion layer is one more place for what you wrote and
 * what the model reads to drift apart).
 */

/** A toolbar action: how it rewrites the selection. */
export type PromptMark =
  | "bold"
  | "italic"
  | "quote"
  | "bullet"
  | "ordered"
  | "heading"
  | "code";

export interface PromptEdit {
  /** The whole new prompt text. */
  text: string;
  /** Where the selection should land afterwards. */
  start: number;
  end: number;
}

/** Wrap the selection in `token` — or UNWRAP it when it's already wrapped, so the same
 *  button toggles. With no selection, insert the pair and put the caret between them.
 *
 * ⚠️ `*` is a PREFIX of `**`, so italic must not mistake a bold marker for its own: it
 * would strip one star off each side and break the bold instead of nesting inside it.
 * `nested` is the longer token to refuse to match. */
function wrap(
  text: string,
  start: number,
  end: number,
  token: string,
  nested?: string,
): PromptEdit {
  const sel = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const n = token.length;
  const isOwn = (s: string, which: "starts" | "ends") =>
    which === "starts"
      ? s.startsWith(token) && !(nested && s.startsWith(nested))
      : s.endsWith(token) && !(nested && s.endsWith(nested));
  // Already wrapped INSIDE the selection ("**x**" selected) → unwrap.
  if (sel.length >= 2 * n && isOwn(sel, "starts") && isOwn(sel, "ends")) {
    const inner = sel.slice(n, -n);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  // Already wrapped AROUND the selection ("**|x|**") → unwrap.
  if (isOwn(before, "ends") && isOwn(after, "starts")) {
    return {
      text: before.slice(0, -n) + sel + after.slice(n),
      start: start - n,
      end: end - n,
    };
  }
  return {
    text: `${before}${token}${sel}${token}${after}`,
    start: start + n,
    end: end + n,
  };
}

/** Prefix every selected LINE (or the caret's line) with `make(i)` — or strip it when
 *  every line already has it, so the button toggles like the inline marks. */
function linePrefix(
  text: string,
  start: number,
  end: number,
  make: (i: number) => string,
  match: RegExp,
): PromptEdit {
  // Grow the range to whole lines: a list marker belongs at the line's head, not
  // wherever the selection happened to start.
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const toIdx = text.indexOf("\n", end);
  const to = toIdx === -1 ? text.length : toIdx;
  const lines = text.slice(from, to).split("\n");
  const allMarked = lines.every((l) => match.test(l));
  const out = lines
    .map((l, i) => (allMarked ? l.replace(match, "") : make(i) + l))
    .join("\n");
  return { text: text.slice(0, from) + out + text.slice(to), start: from, end: from + out.length };
}

/** Apply a toolbar mark to `text[start..end]`. Pure; the caller re-selects. */
export function applyPromptMark(
  text: string,
  start: number,
  end: number,
  mark: PromptMark,
): PromptEdit {
  switch (mark) {
    case "bold":
      return wrap(text, start, end, "**");
    case "italic":
      return wrap(text, start, end, "*", "**");
    case "code":
      return wrap(text, start, end, "`");
    case "quote":
      return linePrefix(text, start, end, () => "> ", /^> /);
    case "bullet":
      return linePrefix(text, start, end, () => "- ", /^- /);
    case "ordered":
      return linePrefix(text, start, end, (i) => `${i + 1}. `, /^\d+\. /);
    case "heading":
      return linePrefix(text, start, end, () => "## ", /^#{1,6} /);
  }
}
