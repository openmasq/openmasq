// @vitest-environment jsdom
import { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "../../testKit";
import { TooltipLayer } from "./TooltipLayer";

/**
 * The layer SUPPRESSES the native tooltip by removing `title` while hovered. That is the
 * one thing here that can do lasting damage: fail to put it back and a control loses its
 * label permanently, in a way nothing visible reports. Every test below is about that
 * attribute surviving, or about the bubble not appearing when it shouldn't.
 */

const bubble = () => document.querySelector(".cv-tooltip");

/** Fire the pointer events the delegated document listener is registered for.
 *  jsdom has no `PointerEvent` constructor; a `MouseEvent` dispatched under the same
 *  type name reaches the same listener and carries the only fields it reads
 *  (`target`, `relatedTarget`). */
const pointer = (type: string, relatedTarget: Element | null = null) =>
  new window.MouseEvent(type, { bubbles: true, relatedTarget });

function hover(el: Element) {
  el.dispatchEvent(pointer("pointerover"));
}
function unhover(el: Element, to: Element | null = null) {
  el.dispatchEvent(pointer("pointerout", to));
}

function trigger(attrs: Record<string, string> = { title: "Envoyer" }) {
  const btn = document.createElement("button");
  for (const [k, v] of Object.entries(attrs)) btn.setAttribute(k, v);
  document.body.appendChild(btn);
  return btn;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TooltipLayer", () => {
  it("shows the title as a branded bubble after the delay, and hides the native one", async () => {
    const m = await mount(<TooltipLayer />);
    const btn = trigger();

    hover(btn);
    expect(bubble(), "nothing before the delay — a sweep must stay quiet").toBeNull();
    expect(btn.getAttribute("title"), "still native until it actually fires").toBe("Envoyer");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(bubble()?.textContent).toBe("Envoyer");
    expect(btn.hasAttribute("title"), "native tooltip suppressed, or both appear").toBe(false);

    await m.unmount();
  });

  it("puts the title back when the pointer leaves", async () => {
    const m = await mount(<TooltipLayer />);
    const btn = trigger();
    await act(async () => {
      hover(btn);
      vi.advanceTimersByTime(500);
    });
    expect(btn.hasAttribute("title")).toBe(false);

    await act(async () => unhover(btn));
    expect(btn.getAttribute("title")).toBe("Envoyer");
    expect(bubble()).toBeNull();
    await m.unmount();
  });

  it("puts the title back on UNMOUNT — no pointer event is ever coming", async () => {
    const m = await mount(<TooltipLayer />);
    const btn = trigger();
    await act(async () => {
      hover(btn);
      vi.advanceTimersByTime(500);
    });
    expect(btn.hasAttribute("title")).toBe(false);

    await m.unmount();
    expect(btn.getAttribute("title"), "a control silently stripped of its label").toBe("Envoyer");
  });

  it("restores the previous trigger when the pointer moves straight to another", async () => {
    const m = await mount(<TooltipLayer />);
    const a = trigger({ title: "Premier" });
    const b = trigger({ title: "Second" });

    await act(async () => {
      hover(a);
      vi.advanceTimersByTime(500);
    });
    await act(async () => {
      unhover(a, b);
      hover(b);
      vi.advanceTimersByTime(500);
    });

    expect(a.getAttribute("title"), "the one we left keeps its label").toBe("Premier");
    expect(bubble()?.textContent).toBe("Second");
    await m.unmount();
  });

  it("says nothing for an element with no title, or an opted-out one", async () => {
    const m = await mount(<TooltipLayer />);
    const plain = trigger({});
    const off = trigger({ title: "Caché", "data-tip": "off" });

    await act(async () => {
      hover(plain);
      hover(off);
      vi.advanceTimersByTime(500);
    });
    expect(bubble()).toBeNull();
    expect(off.getAttribute("title"), "an opted-out control keeps its native tooltip").toBe("Caché");
    await m.unmount();
  });

  it("dismisses on click — the label has served its purpose", async () => {
    const m = await mount(<TooltipLayer />);
    const btn = trigger();
    await act(async () => {
      hover(btn);
      vi.advanceTimersByTime(500);
    });
    expect(bubble()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(pointer("pointerdown"));
    });
    expect(bubble()).toBeNull();
    expect(btn.getAttribute("title")).toBe("Envoyer");
    await m.unmount();
  });
});
