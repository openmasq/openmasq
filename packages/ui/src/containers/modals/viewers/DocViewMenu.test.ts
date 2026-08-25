// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DocViewMenu, type DocViewOption } from "./DocViewMenu";

/**
 * This corner menu is the ONLY way to reach the document preview's other layers now that
 * the header tab strip is gone. Two things break silently if it regresses: a layer that
 * stops being listed is simply unreachable (the "Couche OCR" one is how a user sees text
 * hidden in the pixels before sending), and a menu that stays open after a pick leaves the
 * document covered.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const VIEWS: DocViewOption[] = [
  { id: "pdf", label: "Pages redacted", shield: true },
  { id: "redacted", label: "Redacted", shield: true, hint: "Le texte qui quittera la machine" },
  { id: "ocr", label: "Texte de l'image", hint: "Ce que disent les pixels de la page" },
];

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function render(picked: string[] = []) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      React.createElement(DocViewMenu, {
        views: VIEWS,
        view: "pdf",
        onPick: (id) => picked.push(id),
      }),
    );
  });
  return host;
}

function click(el: Element | null | undefined) {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("DocViewMenu", () => {
  it("names the CURRENT view on the button, and lists every layer once opened", () => {
    const el = render();
    // The tri-dot carries no label, so the current layer must survive somewhere the
    // user can reach without opening the menu.
    expect(el.querySelector(".fv-viewmenu-btn")?.getAttribute("title")).toBe(
      "Vue : Pages redacted",
    );
    expect(el.querySelector(".fv-viewmenu-menu")).toBeNull();

    click(el.querySelector(".fv-viewmenu-btn"));
    const items = [...el.querySelectorAll(".fv-viewmenu-item-name")].map((n) =>
      n.textContent?.trim(),
    );
    expect(items).toEqual(["Pages redacted", "Redacted", "Texte de l'image"]);
    // The open layer is the marked one — a picker with no current state reads as "none".
    expect(el.querySelector(".fv-viewmenu-item.on .fv-viewmenu-item-name")?.textContent).toContain(
      "Pages redacted",
    );
  });

  it("picks a layer and closes, so the choice never covers the document", () => {
    const picked: string[] = [];
    const el = render(picked);
    click(el.querySelector(".fv-viewmenu-btn"));
    click([...el.querySelectorAll(".fv-viewmenu-item")].at(-1));
    expect(picked).toEqual(["ocr"]);
    expect(el.querySelector(".fv-viewmenu-menu")).toBeNull();
  });

  it("closes on Escape WITHOUT letting it reach the modal's own Escape handler", () => {
    const el = render();
    let modalClosed = false;
    const onWindowEsc = () => {
      modalClosed = true;
    };
    window.addEventListener("keydown", onWindowEsc);
    click(el.querySelector(".fv-viewmenu-btn"));
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    window.removeEventListener("keydown", onWindowEsc);
    expect(el.querySelector(".fv-viewmenu-menu")).toBeNull();
    expect(modalClosed).toBe(false);
  });
});
