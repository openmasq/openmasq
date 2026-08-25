// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MobileMemoryScreen } from "./MobileMemoryScreen";
import type { MemoryCard, MemoryData } from "../../../types";

/**
 * The phone is the only place a user can review what the app remembers without a desktop,
 * so two things must hold: every card is reachable as a chip, and an edit made in the
 * sheet actually reaches the store — while a sheet merely opened and dismissed changes
 * NOTHING (a spurious `onUpdate` bumps `updatedAt` on cards the user only looked at).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const card = (id: string, entity: string, cat: string, facts = ""): MemoryCard =>
  ({ id, entity, cat, facts, createdAt: 0, updatedAt: 0 }) as MemoryCard;

const memoire: MemoryData = {
  profile: "",
  cards: [
    card("1", "Marcus Foy", "personne", "Contact chez Acme"),
    card("2", "Acme", "organisation"),
    card("3", "Projet Northwind", "projet"),
    card("4", "Sarah", "personne"),
  ],
};

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function mount(over: Partial<Parameters<typeof MobileMemoryScreen>[0]> = {}) {
  const props = {
    memoire,
    memoryAuto: false,
    onToggleAuto: vi.fn(),
    onSetProfile: vi.fn(),
    onAdd: vi.fn(() => null),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  const container = document.createElement("div");
  // The sheets portal into the mobile shell root.
  container.className = "app-mobile";
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => {
    root.render(React.createElement(MobileMemoryScreen, props));
  });
  return { container, props };
}

const texts = (root: ParentNode, sel: string) =>
  [...root.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? "");

/** Open the sheet for one chip — the BottomSheet mounts a frame later. */
async function openChip(container: HTMLElement, label: string) {
  const chip = [...container.querySelectorAll<HTMLButtonElement>(".mmem-chip")].find((b) =>
    b.textContent?.includes(label),
  );
  if (!chip) throw new Error(`no chip for ${label}`);
  await act(async () => {
    chip.click();
  });
}

describe("MobileMemoryScreen", () => {
  it("shows every card as a chip, grouped by category with its count", () => {
    const { container } = mount();
    expect(texts(container, ".mmem-group-name")).toEqual(["Personne", "Organisation", "Projet"]);
    expect(texts(container, ".mmem-group-n")).toEqual(["2", "1", "1"]);
    expect(container.querySelectorAll(".mmem-chip").length).toBe(memoire.cards.length);
  });

  it("counts the elements it says it remembers", () => {
    const { container } = mount();
    expect(container.querySelector(".mmem-sub")?.textContent).toContain("4 éléments");
  });

  it("commits an edit made in the sheet, and nothing when only opened", async () => {
    const { container, props } = mount();
    await openChip(container, "Marcus Foy");
    const input = document.querySelector<HTMLInputElement>(".mmem-input")!;
    expect(input.value).toBe("Marcus Foy");
    // Dismiss untouched → the card must not be rewritten.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(props.onUpdate).not.toHaveBeenCalled();

    await openChip(container, "Marcus Foy");
    const again = document.querySelector<HTMLTextAreaElement>(".mmem-textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(again, "  Directeur chez Acme  ");
      again.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(props.onUpdate).toHaveBeenCalledWith("1", {
      entity: "Marcus Foy",
      facts: "Directeur chez Acme",
    });
  });

  it("deletes the card the sheet is showing", async () => {
    const { container, props } = mount();
    await openChip(container, "Projet Northwind");
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".mmem-danger")!.click();
    });
    expect(props.onRemove).toHaveBeenCalledWith("3");
  });

  it("offers a first fiche when the memory is empty", () => {
    const { container } = mount({ memoire: { profile: "", cards: [] } });
    expect(container.querySelectorAll(".mmem-group").length).toBe(0);
    expect(container.querySelector(".mmem-empty")?.textContent).toContain("Rien en mémoire");
  });
});
