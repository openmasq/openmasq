import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { LONG_TEXT_THRESHOLD } from "../composerDetection";

/**
 * A paste past `LONG_TEXT_THRESHOLD` FOLDS the draft into a card: the textarea unmounts,
 * and with it the focus and the browser's own undo history. This hook gives both back:
 * focus lands on the card, and Cmd/Ctrl+Z there restores the draft as it was before the
 * change that folded it (the textarea returns, caret where the paste began).
 *
 * Draft text only: nothing here touches detection, the keep list or the send.
 */
export interface PasteUndo {
  /** The draft before the change that folded it. */
  prev: string;
  /** Where to put the caret back (where the inserted text began). */
  caret: number;
  /** The folded draft: the undo only holds while the draft is still exactly this. */
  after: string;
}

/** Does this change of the INLINE textarea fold the draft? Then how to undo it. */
export function foldingChange(
  before: string,
  after: string,
  caretAfter: number,
  threshold = LONG_TEXT_THRESHOLD,
): PasteUndo | null {
  const folds = before.length <= threshold && after.length > threshold;
  if (!folds) return null;
  const caret = caretAfter - (after.length - before.length);
  return { prev: before, caret: Math.max(0, Math.min(before.length, caret)), after };
}

export function isUndoKey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
}

export function useLongPasteUndo({
  input,
  onInput,
  taRef,
}: {
  input: string;
  onInput: (v: string) => void;
  taRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [undo, setUndo] = useState<PasteUndo | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const caretBack = useRef<number | null>(null);

  const onInlineChange = (v: string) => {
    setUndo(foldingChange(input, v, taRef.current?.selectionEnd ?? v.length));
    onInput(v);
  };

  // Any OTHER change of the draft (the modal editor, a send clearing it) retires the undo.
  const live = !!undo && input === undo.after;
  useEffect(() => {
    if (undo && input !== undo.after) setUndo(null);
  }, [input, undo]);

  // The fold unmounted the focused textarea: keep the keyboard in the composer.
  useLayoutEffect(() => {
    if (live) cardRef.current?.focus();
  }, [live]);

  // Back from the card: the textarea has remounted, put the caret where the paste began.
  useLayoutEffect(() => {
    const c = caretBack.current;
    const ta = taRef.current;
    if (c === null || !ta) return;
    caretBack.current = null;
    ta.focus();
    ta.setSelectionRange(c, c);
  });

  const onCardKeyDown = (e: KeyboardEvent) => {
    if (!live || !undo || !isUndoKey(e)) return;
    e.preventDefault();
    caretBack.current = undo.caret;
    setUndo(null);
    onInput(undo.prev);
  };

  return { cardRef, onInlineChange, onCardKeyDown, canUndo: live };
}
