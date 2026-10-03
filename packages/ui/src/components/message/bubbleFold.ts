import { useCallback, useState } from "react";

/**
 * When a USER bubble folds in the thread. A 50-page paste rendered whole buried the
 * conversation under its own prompt; past these bounds the bubble shows its start
 * (`.msg-bubble.is-folded`, a fixed max-height) and « Afficher tout » opens it.
 *
 * Display only: the folded bubble still renders the WHOLE text with its marks (the
 * overflow is clipped by CSS), so the reveal hover, selection and copy see what they
 * always saw. The decision is on characters and lines, never a measured height, so it
 * is the same on first paint, after a remount, and in a test.
 */
export const FOLD_CHARS = 1500;
export const FOLD_LINES = 16;

/** Characters the windowed list should assume for a FOLDED bubble before measuring it
 *  (≈ the CSS max-height at the list's px-per-char guess). */
export const FOLDED_ESTIMATE_CHARS = 1600;

export function isLongUserText(text: string): boolean {
  if (text.length > FOLD_CHARS) return true;
  let lines = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    if (++lines > FOLD_LINES) return true;
  }
  return false;
}

/** The pre-measurement size of a message row for the windowed list: a folded user
 *  bubble is short on screen whatever its length. Render cost (`sizeOf`) is unchanged. */
export function estimateCharsOf(m: { role: string; content: string }): number {
  return m.role === "user" && isLongUserText(m.content)
    ? Math.min(m.content.length, FOLDED_ESTIMATE_CHARS)
    : m.content.length;
}

/** Bubbles the user opened. Module-level on purpose: the list is VIRTUALISED, and a row
 *  scrolled out and back must not fold again under the reader. Ids are unique. */
const opened = new Set<string>();

export function useBubbleFold(id: string, long: boolean) {
  const [open, setOpen] = useState(() => opened.has(id));
  const toggle = useCallback(() => {
    setOpen((was) => {
      if (was) opened.delete(id);
      else opened.add(id);
      return !was;
    });
  }, [id]);
  return { folded: long && !open, toggle };
}
