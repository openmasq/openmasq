import type { BlockType } from "./blocks";

/**
 * The TYPING rules — what makes the editor feel like Notion instead of like a form:
 * you never pick a block type from a menu, you type its shorthand and the block becomes
 * it. Pure decisions, so the component only has to apply them (`typing.test.ts`).
 *
 * The vocabulary is the markdown the document is stored in, which is the point: the
 * shorthand a user already knows IS the source format, so nothing has to be learned
 * and nothing has to be converted.
 */

/** A block-shorthand typed at the START of a block, resolved on the SPACE that ends it. */
const BLOCK_RULES: { re: RegExp; type: BlockType }[] = [
  { re: /^#$/, type: "h1" },
  { re: /^##$/, type: "h2" },
  { re: /^###$/, type: "h3" },
  { re: /^[-*]$/, type: "ul" },
  { re: /^\d+[.)]$/, type: "ol" },
  { re: /^>$/, type: "quote" },
  { re: /^```$/, type: "code" },
];

/**
 * The block type the text BEFORE the caret asks for, when the user presses space.
 * `null` = no rule fired, the space is an ordinary space.
 */
export function blockRuleFor(textBeforeCaret: string): BlockType | null {
  return BLOCK_RULES.find((r) => r.re.test(textBeforeCaret))?.type ?? null;
}

/**
 * What Enter produces after a block of `type`.
 *
 * A list CONTINUES (that is the whole point of a list), everything else drops back to a
 * paragraph — pressing Enter under a heading to write the paragraph beneath it is the
 * single most common gesture in a document, and inheriting the heading there is the
 * classic editor annoyance.
 */
export function typeAfterEnter(type: BlockType, textWasEmpty: boolean): BlockType {
  if (textWasEmpty) return "p"; // Enter on an empty list item ENDS the list
  return type === "ul" || type === "ol" ? type : "p";
}

/** True when Enter on this block should END the construct instead of continuing it —
 *  an empty list item or quote. The caller converts the block to a paragraph in place
 *  rather than adding a new one (Notion's behaviour, and the only way out of a list
 *  that doesn't require reaching for the mouse). */
export function enterEndsBlock(type: BlockType, textWasEmpty: boolean): boolean {
  return textWasEmpty && (type === "ul" || type === "ol" || type === "quote");
}

export type InlineMark = "bold" | "italic" | "code";

/** ⌘/Ctrl chords → the inline mark they apply. Deliberately the three the OS-wide
 *  muscle memory already has; a fourth would be a shortcut nobody guesses. */
export function markForChord(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
}): InlineMark | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "b") return "bold";
  if (k === "i") return "italic";
  if (k === "e") return "code";
  return null;
}

/** Which `document.execCommand` name applies a mark. `code` has none — the component
 *  wraps the selection itself; stated here so the mapping lives with the chords. */
export const EXEC_FOR_MARK: Record<InlineMark, string | null> = {
  bold: "bold",
  italic: "italic",
  code: null,
};
