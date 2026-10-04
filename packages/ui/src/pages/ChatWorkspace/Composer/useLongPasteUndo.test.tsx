// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, useRef, useState } from "react";
import { mount } from "../../../testKit";
import { LongTextCard } from "../ComposerChips";
import { LONG_TEXT_THRESHOLD, longTextStats } from "../composerDetection";
import { foldingChange, isUndoKey, useLongPasteUndo } from "./useLongPasteUndo";

/** The composer's fold, reduced to what the hook touches: the inline textarea ⇄ the card. */
function Harness({ initial, log }: { initial: string; log: string[] }) {
  const [input, setInput] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const onInput = (v: string) => {
    log.push(v);
    setInput(v);
  };
  const u = useLongPasteUndo({ input, onInput, taRef });
  return input.length > LONG_TEXT_THRESHOLD ? (
    <LongTextCard
      stats={longTextStats(input)}
      onOpen={() => {}}
      cardRef={u.cardRef}
      onKeyDown={u.onCardKeyDown}
      canUndo={u.canUndo}
    />
  ) : (
    <textarea ref={taRef} value={input} onChange={(e) => u.onInlineChange(e.target.value)} />
  );
}

const press = async (el: Element, init: KeyboardEventInit) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};

describe("foldingChange", () => {
  it("only a change that CROSSES the threshold folds; the caret goes back to the paste start", () => {
    const big = "x".repeat(LONG_TEXT_THRESHOLD + 10);
    expect(foldingChange("Bonjour ", `Bonjour ${big}`, 8 + big.length)).toEqual({
      prev: "Bonjour ",
      caret: 8,
      after: `Bonjour ${big}`,
    });
    expect(foldingChange("court", "court!", 6)).toBeNull();
    expect(foldingChange(big, `${big}!`, big.length + 1)).toBeNull();
  });

  it("Cmd+Z and Ctrl+Z undo; Shift (redo) does not", () => {
    expect(isUndoKey({ key: "z", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(true);
    expect(isUndoKey({ key: "Z", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBe(true);
    expect(isUndoKey({ key: "z", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false })).toBe(false);
  });
});

describe("useLongPasteUndo — a long paste keeps focus and undo", () => {
  it("focuses the card after the paste, and Cmd/Ctrl+Z restores the draft with the textarea", async () => {
    const log: string[] = [];
    const m = await mount(<Harness initial="Résume ce contrat : " log={log} />);
    const ta = m.find<HTMLTextAreaElement>("textarea");
    const pasted = `Résume ce contrat : ${"Clause. ".repeat(LONG_TEXT_THRESHOLD / 4)}`;
    await m.type(ta, pasted);

    const card = m.find<HTMLButtonElement>("button.composer-longtext");
    expect(document.activeElement).toBe(card);
    expect(card.textContent).toMatch(/annuler le collage/);

    await press(card, { key: "z", ctrlKey: true });
    const back = m.find<HTMLTextAreaElement>("textarea");
    expect(back.value).toBe("Résume ce contrat : ");
    expect(document.activeElement).toBe(back);
    expect(back.selectionStart).toBe("Résume ce contrat : ".length);
    expect(log.at(-1)).toBe("Résume ce contrat : ");
    await m.unmount();
  });

  it("an unrelated key on the card does nothing, and a draft that was already long has no undo", async () => {
    const log: string[] = [];
    const long = "y".repeat(LONG_TEXT_THRESHOLD + 1);
    const m = await mount(<Harness initial={long} log={log} />);
    const card = m.find<HTMLButtonElement>("button.composer-longtext");
    expect(card.textContent).not.toMatch(/annuler le collage/);
    await press(card, { key: "z", metaKey: true });
    expect(log).toEqual([]);
    expect(m.maybe("textarea")).toBeNull();
    await m.unmount();
  });
});
