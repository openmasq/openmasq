import { useState, type RefObject } from "react";
import { useTextSelection } from "../../../hooks/useTextSelection";
import { memoryNoteTitle } from "../../../memory";
import { setMemoryFresh, useAppDispatch } from "../../../state/redux";
import type { Messages } from "@openmasq/i18n";
import type { ChatViewProps, IntentTag } from "./types";

interface Deps {
  scrollRef: RefObject<HTMLDivElement | null>;
  input: string;
  handleInput: (text: string) => void;
  setActiveTag: (tag: IntentTag | null) => void;
  t: Messages;
}

/**
 * Selecting text in a message pops the SAME menu the composer pops on a draft selection:
 * Redact, Préciser (quote into the composer + tag the send) and « Retenir ». Retenir is
 * deterministic and local — the selection is REAL text, and sending it anywhere would be
 * new egress.
 */
export function useSelectionActions(p: ChatViewProps, d: Deps) {
  const { sel, onMouseUp: onMessagesMouseUp, clear: clearSel } = useTextSelection(d.scrollRef, {
    within: "[data-user-text]",
  });
  const dispatch = useAppDispatch();
  const [memToast, setMemToast] = useState<{ x: number; y: number } | null>(null);

  const dropSelection = () => {
    window.getSelection()?.removeAllRanges();
    clearSel();
  };
  const onPreciser = () => {
    if (!sel) return;
    d.setActiveTag({ tag: "preciser", label: d.t.conversation.clarify, tone: "forest" });
    const quote = `« ${sel.text} »`;
    d.handleInput(d.input ? `${d.input}\n\n${quote}` : quote);
    dropSelection();
  };
  const onRetenir = () => {
    if (!sel || !p.onAddMemoryCard) return;
    const text = sel.text.trim();
    if (!text) return;
    const card = p.onAddMemoryCard({ entity: memoryNoteTitle(text), facts: text, cat: "autre" });
    if (card) {
      dispatch(setMemoryFresh(true));
      setMemToast({ x: sel.x, y: sel.y });
    }
    dropSelection();
  };

  return { sel, onMessagesMouseUp, dropSelection, onPreciser, onRetenir, memToast, clearMemToast: () => setMemToast(null) };
}

export type SelectionActionsApi = ReturnType<typeof useSelectionActions>;
