import { useEffect, useRef } from "react";
import { blocksToDom, domToMarkdown, parseBlocks, type BlockType } from "./blocks";
import { blockRuleFor, enterEndsBlock, markForChord, typeAfterEnter } from "./typing";

import { useT } from "../../../../../i18n";
/**
 * The document, EDITED IN PLACE — same typography as the rendered card, no mode switch,
 * no markdown source on screen. Replaces the mono `<textarea>` the card used to swap in,
 * which asked the reader of a letter to edit its source.
 *
 * ⚠️ React renders the shell and NOTHING inside it. The content is written once through
 * the DOM (`blocksToDom`) and from then on belongs to the browser: a re-render that
 * touched the children would move the caret to the start on every keystroke. That is
 * also why the value is read back on demand (`domToMarkdown`) rather than mirrored into
 * state — the DOM IS the draft while editing.
 *
 * Everything the user is used to comes from the browser (Enter, Backspace-merge,
 * selection, undo, paste); this file only adds what makes it a DOCUMENT: the block
 * shorthands, the mark chords, and save/cancel.
 */
export function DocumentEditor({
  markdown,
  onSave,
  onCancel,
  saving,
}: {
  /** The document's markdown at the moment editing started. Read ONCE — see above. */
  markdown: string;
  /** Called with the current markdown. The card owns persistence (and the edit-time
   *  redaction pass behind it), so a rejected save leaves this surface untouched. */
  onSave: (next: string) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // The latest markdown, so a blur/⌘Enter save never has to re-read a detached node.
  const read = () => (ref.current ? domToMarkdown(ref.current) : markdown);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren(blocksToDom(parseBlocks(markdown), document));
    // Caret at the very end, like reopening a document you were writing.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.focus();
    // Mount-only on purpose: `markdown` changing under a live edit would wipe the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The block element the caret sits in. */
  const caretBlock = (): HTMLElement | null => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node || !ref.current) return null;
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    const block = el?.closest<HTMLElement>("[data-b]");
    return block && ref.current.contains(block) ? block : (el?.parentElement === ref.current ? el : null);
  };

  /** Text of the block from its start up to the caret — what a shorthand is tested on. */
  const textBeforeCaret = (block: HTMLElement): string => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(block);
    r.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return r.toString();
  };

  /** Re-type a block in place, keeping its remaining inline content and the caret. */
  const retype = (block: HTMLElement, type: BlockType, stripChars: number) => {
    const doc = document;
    const tag = type === "ul" || type === "ol" ? "li" : type === "quote" ? "blockquote" : type === "code" ? "pre" : type;
    const next = doc.createElement(tag);
    next.setAttribute("data-b", type);
    // Drop the shorthand the user typed, keep everything after it.
    const range = doc.createRange();
    range.selectNodeContents(block);
    const frag = range.extractContents();
    const first = frag.firstChild;
    if (first && first.nodeType === 3 && stripChars > 0) {
      first.nodeValue = (first.nodeValue ?? "").slice(stripChars);
    }
    next.appendChild(frag);
    if (!next.textContent) next.appendChild(doc.createElement("br"));
    block.replaceWith(next);
    const sel = window.getSelection();
    const r = doc.createRange();
    r.selectNodeContents(next);
    r.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  /** Wrap the selection in `<code>` — the one mark `execCommand` has no verb for. */
  const wrapCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const code = document.createElement("code");
    code.appendChild(sel.getRangeAt(0).extractContents());
    sel.getRangeAt(0).insertNode(code);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(code);
    sel.addRange(r);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave(read());
      return;
    }
    const mark = markForChord(e);
    if (mark) {
      e.preventDefault();
      if (mark === "code") wrapCode();
      else document.execCommand(mark, false);
      return;
    }
    const block = caretBlock();
    if (!block) return;

    // SPACE resolves a block shorthand typed at the start of the block.
    if (e.key === " ") {
      const before = textBeforeCaret(block);
      const type = blockRuleFor(before);
      if (type) {
        e.preventDefault();
        retype(block, type, before.length);
      }
      return;
    }

    // ENTER: continue a list, end an empty one, drop back to a paragraph otherwise.
    if (e.key === "Enter" && !e.shiftKey) {
      const type = (block.getAttribute("data-b") as BlockType) ?? "p";
      const empty = (block.textContent ?? "").trim() === "";
      if (enterEndsBlock(type, empty)) {
        e.preventDefault();
        retype(block, "p", 0);
        return;
      }
      const nextType = typeAfterEnter(type, empty);
      // Let the browser split the block, then re-tag the half it created — this is what
      // keeps Enter's caret/selection behaviour native instead of re-implemented.
      queueMicrotask(() => {
        const now = caretBlock();
        if (now && now !== block && !now.getAttribute("data-b")) {
          const tag = nextType === "ul" || nextType === "ol" ? "li" : nextType;
          if (now.tagName.toLowerCase() !== tag) retype(now, nextType, 0);
          else now.setAttribute("data-b", nextType);
        }
      });
    }
  };

  return (
    <div
      ref={ref}
      // `.md` too: the editor inherits the RENDERED document's typography, so clicking
      // into the text changes nothing visible except the caret.
      className="md md-document-edit"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={t.leaves.document.editorAria}
      aria-busy={saving || undefined}
      spellCheck
      onKeyDown={onKeyDown}
      // Saving on BLUR is what removes the mode: you click away and it is written, like
      // a document. ⌘Entrée is the explicit version for people who want one.
      onBlur={() => onSave(read())}
    />
  );
}
