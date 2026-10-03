// @vitest-environment jsdom
// The PDF viewer while its document is still read or masked (`pending`), and the moment it
// becomes final: a page is drawn from its raster ONLY once masked and proven covered; the
// strip and the arrow keys move page to page; pending → final is the SAME instance.
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PdfReplacement, RenderedPage } from "@openmasq/redact/pdf-redact";
import { ChatStoreProvider } from "../../../providers/chatStore";
import type { ChatStore } from "../../../../state/store";
import { mount } from "../../../../testKit";
import { PdfRedactedViewer } from "./PdfRedactedViewer";
import type { PendingPdf } from "./pendingPages";

const PAGE_TEXT = ["Emprunteur : Jean Dupont", "Contact Marie Curie", "Fin du relevé"];
const renders: { p: number; reps: string[] }[] = [];
const loads = vi.fn();

vi.mock("@openmasq/redact/pdf-redact", async (orig) => {
  const real = await orig<typeof import("@openmasq/redact/pdf-redact")>();
  return {
    ...real,
    loadRedactedPdf: async () => {
      loads();
      return {
        total: 3,
        pagesInFile: 3,
        pageSize: async () => ({ cssW: 100, cssH: 140 }),
        // A text-layer page paints (and covers) the values its text holds; page 2 plays a
        // SCAN read without its OCR geometry: nothing painted, nothing covered.
        renderPage: async (p: number, _reveal?: unknown, over?: { replacements?: PdfReplacement[]; ocrPages?: unknown }) => {
          const reps = over?.replacements ?? [];
          renders.push({ p, reps: reps.map((r) => r.real) });
          const canvas = document.createElement("canvas");
          canvas.dataset.raster = String(p);
          const scanNoGeometry = p === 2 && !over?.ocrPages;
          const covered = new Set(scanNoGeometry ? [] : reps.filter((r) => PAGE_TEXT[p - 1].includes(r.real)).map((r) => r.real));
          return { canvas, boxes: [], words: [], wireWords: [], imageZones: [], imageOnly: false, cssW: 100, cssH: 140, covered, applyReveal: () => [] } as unknown as RenderedPage;
        },
        destroy: async () => {},
      };
    },
  };
});

beforeAll(() => {
  // Every page shell is « near the viewport » at once.
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(private cb: (e: { target: Element; isIntersecting: boolean }[]) => void) {}
    observe(target: Element) {
      this.cb([{ target, isIntersecting: true }]);
    }
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  renders.length = 0;
  loads.mockClear();
});

const store = { settings: {} } as unknown as ChatStore;
const wrap = (children: ReactNode) => <ChatStoreProvider store={store}>{children}</ChatStoreProvider>;
const bytes = new Uint8Array([1]);
const thumb = "data:image/png;base64,iVBORw0KGgo=";
const JEAN: PdfReplacement = { real: "Jean Dupont", fake: "Luc Martin", tone: "violet", kind: "name" };
const MARIE: PdfReplacement = { real: "Marie Curie", fake: "Anne Morel", tone: "violet", kind: "name" };
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const rasters = (el: HTMLElement) => [...el.querySelectorAll<HTMLCanvasElement>("canvas[data-raster]")].map((c) => Number(c.dataset.raster));

describe("PdfRedactedViewer — a document still being masked", () => {
  const pending = (states: PendingPdf["pages"][number]["state"][]): PendingPdf => ({
    replacements: [JEAN, MARIE],
    pages: states.map((state, i) => ({ state, thumb, text: PAGE_TEXT[i] })),
  });

  it("only a MASKED page is rendered; the others show their thumbnail, never their raster", async () => {
    const m = await mount(<PdfRedactedViewer bytes={bytes} pending={pending(["masked", "read", "waiting"])} />, { wrap });
    await settle();
    expect(renders.map((r) => r.p)).toEqual([1]); // pages 2 and 3 are never even rasterised
    expect(rasters(m.el)).toEqual([1]);
    expect(m.el.querySelectorAll(".pdfv-wait img.pdfv-wait-thumb")).toHaveLength(2);
    expect(m.el.querySelector(".pdfv-page.is-provisional")).not.toBeNull();
    await m.unmount();
  });

  it("a masked page whose values its paint does not cover (a scan, no geometry yet) stays a thumbnail", async () => {
    const m = await mount(<PdfRedactedViewer bytes={bytes} pending={pending(["masked", "masked", "waiting"])} />, { wrap });
    await settle();
    expect(renders.map((r) => r.p).sort()).toEqual([1, 2]);
    expect(rasters(m.el)).toEqual([1]); // page 2 was painted off-screen, never mounted
    await m.unmount();
  });

  it("becomes final in the SAME instance: no reload, every page repainted with the final map", async () => {
    const m = await mount(<PdfRedactedViewer bytes={bytes} pending={pending(["masked", "read", "waiting"])} />, { wrap });
    await settle();
    await m.rerender(<PdfRedactedViewer bytes={bytes} replacements={[JEAN, MARIE]} ocrPages={[undefined, { words: [], width: 1, height: 1 }, undefined]} />);
    await settle();
    expect(loads).toHaveBeenCalledTimes(1);
    expect(rasters(m.el).sort()).toEqual([1, 2, 3]);
    expect(m.el.querySelector(".pdfv-wait")).toBeNull();
    expect(m.el.querySelector(".pdfv-page.is-provisional")).toBeNull();
    await m.unmount();
  });

  it("a map that grows repaints the pages already shown (a value found later marks them too)", async () => {
    const m = await mount(<PdfRedactedViewer bytes={bytes} pending={{ ...pending(["masked", "waiting", "waiting"]), replacements: [MARIE] }} />, { wrap });
    await settle();
    await m.rerender(<PdfRedactedViewer bytes={bytes} pending={pending(["masked", "waiting", "waiting"])} />);
    await settle();
    const last = renders.filter((r) => r.p === 1).at(-1);
    expect(last?.reps).toContain("Jean Dupont");
    await m.unmount();
  });
});

describe("PdfRedactedViewer — the page strip and the arrow keys", () => {
  const key = (k: string, target: EventTarget = window) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });
  const here = (el: HTMLElement) => el.querySelector('.pdfv-strip [aria-current="page"]')?.textContent;

  it("one tile per page; ←/→ and ↑/↓ jump page to page, not from a field", async () => {
    const m = await mount(<PdfRedactedViewer bytes={bytes} replacements={[JEAN]} />, { wrap });
    await settle();
    expect(m.el.querySelectorAll(".pdfv-strip-page")).toHaveLength(3);
    expect(here(m.el)).toBe("1");
    await key("ArrowRight");
    expect(here(m.el)).toBe("2");
    await key("ArrowDown");
    expect(here(m.el)).toBe("3");
    await key("ArrowDown"); // the last page stays the last
    expect(here(m.el)).toBe("3");
    await key("ArrowUp");
    await key("ArrowLeft");
    expect(here(m.el)).toBe("1");
    const field = document.createElement("input");
    document.body.appendChild(field);
    await key("ArrowRight", field);
    expect(here(m.el)).toBe("1");
    field.remove();
    await act(async () => m.el.querySelectorAll<HTMLButtonElement>(".pdfv-strip-page")[2]!.click());
    expect(here(m.el)).toBe("3");
    await m.unmount();
  });
});
