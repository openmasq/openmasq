// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../testKit";
import type { Message } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { estimateCharsOf, FOLD_CHARS, FOLD_LINES, isLongUserText } from "./bubbleFold";

const userMsg = (id: string, content: string): Message => ({ id, role: "user", content }) as Message;

describe("bubbleFold — when a user bubble folds", () => {
  it("folds past the char bound or the line bound, never below", () => {
    expect(isLongUserText("a".repeat(FOLD_CHARS))).toBe(false);
    expect(isLongUserText("a".repeat(FOLD_CHARS + 1))).toBe(true);
    expect(isLongUserText(Array(FOLD_LINES).fill("x").join("\n"))).toBe(false);
    expect(isLongUserText(Array(FOLD_LINES + 1).fill("x").join("\n"))).toBe(true);
  });

  it("estimates a folded bubble short, a reply at its length", () => {
    const long = "a".repeat(200_000);
    expect(estimateCharsOf({ role: "user", content: long })).toBeLessThan(2000);
    expect(estimateCharsOf({ role: "assistant", content: long })).toBe(200_000);
  });
});

describe("UserMessage — « Afficher tout » / « Réduire »", () => {
  it("a long bubble is folded, keeps its marks, and opens then folds back", async () => {
    const text = `Bonjour, je représente Jean Dupont.\n${"Clause. ".repeat(400)}`;
    const m = await mount(
      <MessageBubble
        message={userMsg("u-long", text)}
        vault={{ "[PERSON1]": "Jean Dupont" }}
        kinds={{ "Jean Dupont": "person" }}
      />,
    );
    const bubble = m.find(".msg-bubble");
    expect(bubble.classList.contains("is-folded")).toBe(true);
    expect(bubble.hasAttribute("data-user-text")).toBe(true);
    // The whole text is still rendered (CSS clips it): marks, selection and copy unchanged.
    expect(bubble.textContent).toBe(text);
    expect(m.find("mark.redaction-mark").getAttribute("data-real")).toBe("Jean Dupont");

    const toggle = m.find<HTMLButtonElement>("button.msg-fold");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("Afficher tout");
    await m.click(toggle);
    expect(m.find(".msg-bubble").classList.contains("is-folded")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Réduire");
    await m.click(toggle);
    expect(m.find(".msg-bubble").classList.contains("is-folded")).toBe(true);
    await m.unmount();
  });

  it("an opened bubble stays open when the virtualised list remounts it", async () => {
    const text = "x".repeat(FOLD_CHARS + 10);
    const a = await mount(<MessageBubble message={userMsg("u-remount", text)} />);
    await a.click("button.msg-fold");
    await a.unmount();
    const b = await mount(<MessageBubble message={userMsg("u-remount", text)} />);
    expect(b.find(".msg-bubble").classList.contains("is-folded")).toBe(false);
    await b.unmount();
  });

  it("a short bubble has no toggle", async () => {
    const m = await mount(<MessageBubble message={userMsg("u-short", "Une question courte.")} />);
    expect(m.maybe("button.msg-fold")).toBeNull();
    expect(m.find(".msg-bubble").classList.contains("is-folded")).toBe(false);
    await m.unmount();
  });
});
