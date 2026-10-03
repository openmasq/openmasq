// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../testKit";
import { ChatStoreProvider } from "../../containers/providers/chatStore";
import type { ChatStore } from "../../state/store";
import { AttachmentPreviewHost } from "./AttachmentPreviewHost";
import type { Attachment } from "./Composer";

const fr = getMessages("fr");
const loads = vi.fn();

// pdf.js is not what is under test here: a three-page document whose pages cover their values.
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
        renderPage: async (_p: number, _r?: unknown, over?: { replacements?: { real: string }[] }) => ({
          canvas: document.createElement("canvas"),
          boxes: [], words: [], wireWords: [], imageZones: [], imageOnly: false, cssW: 100, cssH: 140,
          covered: new Set((over?.replacements ?? []).map((r) => r.real)),
          applyReveal: () => [],
        }),
        destroy: async () => {},
      };
    },
  };
});
afterEach(() => loads.mockClear());

beforeAll(() => {
  // jsdom has no ResizeObserver; the text page measures its container width.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(private cb: (e: { target: Element; isIntersecting: boolean }[]) => void) {}
    observe(target: Element) {
      this.cb([{ target, isIntersecting: true }]);
    }
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

const scan = (over: Partial<Attachment> = {}): Attachment => ({
  name: "scan-contrat.pdf",
  kind: "pdf",
  text: "Jean Dupont, 12 rue des Lilas",
  chars: 29,
  redactPreview: 0,
  cid: "c1",
  ...over,
});

describe("AttachmentPreviewHost — un document ouvert pendant l'OCR", () => {
  it("montre un chargement et la page lue, jamais le texte en clair", async () => {
    const m = await mount(
      <AttachmentPreviewHost
        preview={scan({ extracting: true, extractProgress: { done: 2, total: 12 } })}
        onClose={() => {}}
      />,
    );
    const shown = document.body.textContent ?? "";
    expect(shown).toContain(fr.composer.attachments.stateReadingPage(3, 12));
    expect(shown).toContain(fr.viewers.pendingNote);
    expect(shown).not.toContain("Jean Dupont");
    expect(document.body.querySelector('[aria-busy="true"]')).not.toBeNull();
    await m.unmount();
  });

  it("pendant le premier masquage aussi : le texte n'est pas encore masqué, il ne s'affiche pas", async () => {
    const m = await mount(
      <AttachmentPreviewHost preview={scan({ redacting: true })} onClose={() => {}} />,
    );
    const shown = document.body.textContent ?? "";
    expect(shown).toContain(fr.composer.attachments.stateMasking);
    expect(shown).not.toContain("Jean Dupont");
    await m.unmount();
  });
});

describe("AttachmentPreviewHost — l'aperçu PROGRESSIF pendant le masquage", () => {
  const text = "Emprunteur : Jean Dupont. Garant : Marie Curie, 12 rue des Lilas.";
  const partial = (covered: number) =>
    scan({
      text,
      chars: text.length,
      redacting: true,
      redactProgress: { done: 1, total: 2 },
      maskedSoFar: { covered, scanned: 40, replacements: [{ real: "Jean Dupont", fake: "Luc Martin", tone: "violet", kind: "name" }] },
    });

  it("la part masquée s'affiche MASQUÉE, le reste jamais — et l'aperçu se dit provisoire", async () => {
    const m = await mount(<AttachmentPreviewHost preview={partial(26)} onClose={() => {}} />);
    const shown = document.body.textContent ?? "";
    expect(shown).toContain("Luc Martin");
    expect(shown).not.toContain("Jean Dupont");
    expect(shown).not.toContain("Marie Curie"); // past `covered`: not masked yet, not drawn
    expect(shown).not.toContain("Lilas");
    expect(shown).toContain(fr.viewers.partialNote);
    expect(shown).toContain(fr.viewers.partialRest(50));
    // The real value of a mark is not in the DOM either (no hover data on this view).
    expect(document.body.innerHTML).not.toContain("Jean Dupont");
    expect(document.body.querySelector("mark.redaction-mark")).not.toBeNull();
    await m.unmount();
  });

  it("rien de masqué encore : le cadre d'attente, sans texte", async () => {
    const m = await mount(<AttachmentPreviewHost preview={partial(0)} onClose={() => {}} />);
    const shown = document.body.textContent ?? "";
    expect(shown).toContain(fr.viewers.pendingNote);
    expect(shown).not.toContain("Emprunteur");
    await m.unmount();
  });
});

describe("AttachmentPreviewHost — un PDF ouvert pendant sa LECTURE : le vrai visualiseur", () => {
  const store = { settings: {} } as unknown as ChatStore;
  const wrap = (children: ReactNode) => <ChatStoreProvider store={store}>{children}</ChatStoreProvider>;
  const thumb = "data:image/png;base64,iVBORw0KGgo=";
  const page1 = "Emprunteur : Jean Dupont";
  const JEAN = { real: "Jean Dupont", fake: "Luc Martin", tone: "violet", kind: "name" };
  const reading = (): Partial<Attachment> => ({
    text: "",
    data: "JVBERi0=",
    extracting: true,
    extractProgress: { done: 1, total: 3 },
    reading: {
      total: 3,
      thumbs: [thumb, thumb, undefined],
      read: [true],
      mask: { covered: page1.length, scanned: page1.length, replacements: [JEAN], pageTexts: [page1] },
    },
  });
  const settle = async () => {
    for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };

  it("s'ouvre sur les pages, provisoires, la ligne de lecture en tête — jamais le cadre texte", async () => {
    const m = await mount(<AttachmentPreviewHost preview={scan(reading())} onClose={() => {}} />, { wrap });
    await settle();
    const shown = document.body.textContent ?? "";
    expect(document.body.querySelector(".pdfv")).not.toBeNull();
    expect(shown).toContain(fr.viewers.pdf.provisional);
    expect(shown).toContain(fr.composer.attachments.stateReadingPage(2, 3));
    expect(shown).not.toContain(fr.viewers.pendingNote);
    expect(document.body.querySelector('[aria-label="' + fr.viewers.reading.pageMasked(1) + '"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="' + fr.viewers.reading.pageCurrent(2) + '"]')).not.toBeNull();
    expect(loads).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("devient définitif dans la MÊME fenêtre, le même visualiseur, sans recharger le document", async () => {
    const m = await mount(<AttachmentPreviewHost preview={scan(reading())} onClose={() => {}} />, { wrap });
    await settle();
    const viewer = document.body.querySelector(".pdfv");
    const final = scan({ data: "JVBERi0=", text: page1, replacements: [JEAN] });
    await m.rerender(<AttachmentPreviewHost preview={final} onClose={() => {}} />);
    await settle();
    expect(document.body.querySelector(".pdfv")).toBe(viewer);
    expect(document.body.textContent ?? "").not.toContain(fr.viewers.pdf.provisional);
    expect(loads).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("un PDF choisi encore en file d'attente de lecture n'est pas ouvert par le visualiseur", async () => {
    const m = await mount(
      <AttachmentPreviewHost preview={scan({ text: "", path: "/x/releve.pdf", extracting: true, extractQueued: 1 })} onClose={() => {}} />,
      { wrap },
    );
    await settle();
    expect(document.body.querySelector(".pdfv")).toBeNull();
    expect(loads).not.toHaveBeenCalled();
    await m.unmount();
  });
});

describe("AttachmentPreviewHost — la fin de la lecture ne referme pas la fenêtre", () => {
  const store = { settings: {} } as unknown as ChatStore;
  const wrap = (children: ReactNode) => <ChatStoreProvider store={store}>{children}</ChatStoreProvider>;

  it("l'aperçu réel prend la suite du cadre d'attente sans animation d'ouverture", async () => {
    const m = await mount(
      <AttachmentPreviewHost preview={scan({ extracting: true, extractProgress: { done: 2, total: 12 } })} onClose={() => {}} />,
      { wrap },
    );
    expect(document.body.querySelector(".modal-sweep")).not.toBeNull();
    await m.rerender(<AttachmentPreviewHost preview={scan({ replacements: [] })} onClose={() => {}} />);
    // The real preview is on screen, and it did not play the opening sweep again.
    expect(document.body.textContent ?? "").not.toContain(fr.viewers.pendingNote);
    expect(document.body.querySelector(".modal-sweep")).toBeNull();
    await m.unmount();
  });

  it("ouvert d'emblée sur un document prêt, il s'ouvre normalement", async () => {
    const m = await mount(<AttachmentPreviewHost preview={scan({ replacements: [] })} onClose={() => {}} />, { wrap });
    expect(document.body.querySelector(".modal-sweep")).not.toBeNull();
    await m.unmount();
  });
});
