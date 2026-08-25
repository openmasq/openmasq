import { describe, it, expect } from "vitest";
import { applyPromptMark } from "./promptFormat";

describe("applyPromptMark — inline marks", () => {
  it("wraps the selection and re-selects the same words", () => {
    const out = applyPromptMark("say hello there", 4, 9, "bold");
    expect(out.text).toBe("say **hello** there");
    expect(out.text.slice(out.start, out.end)).toBe("hello");
  });

  it("UNWRAPS when the selection already includes the tokens (the button toggles)", () => {
    const out = applyPromptMark("say **hello** there", 4, 13, "bold");
    expect(out.text).toBe("say hello there");
    expect(out.text.slice(out.start, out.end)).toBe("hello");
  });

  it("UNWRAPS when the tokens sit just OUTSIDE the selection", () => {
    const out = applyPromptMark("say **hello** there", 6, 11, "bold");
    expect(out.text).toBe("say hello there");
    expect(out.text.slice(out.start, out.end)).toBe("hello");
  });

  it("with no selection, inserts the pair and puts the caret between them", () => {
    const out = applyPromptMark("ab", 1, 1, "italic");
    expect(out.text).toBe("a**b");
    expect(out.start).toBe(2);
    expect(out.end).toBe(2);
  });

  it("italic does not mistake a bold marker for its own", () => {
    const out = applyPromptMark("**x**", 2, 3, "italic");
    expect(out.text).toBe("***x***");
  });
});

describe("applyPromptMark — line marks", () => {
  it("prefixes every selected line, from each line's head", () => {
    // The selection starts mid-word: the marker must still land at the line start.
    const out = applyPromptMark("one\ntwo", 1, 5, "bullet");
    expect(out.text).toBe("- one\n- two");
  });

  it("numbers an ordered list per line", () => {
    const out = applyPromptMark("a\nb\nc", 0, 5, "ordered");
    expect(out.text).toBe("1. a\n2. b\n3. c");
  });

  it("strips the prefix when EVERY line already has it", () => {
    const out = applyPromptMark("- a\n- b", 0, 7, "bullet");
    expect(out.text).toBe("a\nb");
  });

  it("adds rather than strips when only SOME lines are marked", () => {
    const out = applyPromptMark("- a\nb", 0, 5, "bullet");
    expect(out.text).toBe("- - a\n- b");
  });

  it("heading replaces any existing level rather than stacking #", () => {
    const out = applyPromptMark("## t", 0, 4, "heading");
    expect(out.text).toBe("t");
  });

  it("acts on the caret's own line when there is no selection", () => {
    const out = applyPromptMark("one\ntwo", 5, 5, "quote");
    expect(out.text).toBe("one\n> two");
  });
});
