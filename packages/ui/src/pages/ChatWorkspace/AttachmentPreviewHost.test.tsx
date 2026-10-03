// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../testKit";
import { AttachmentPreviewHost } from "./AttachmentPreviewHost";
import type { Attachment } from "./Composer";

const fr = getMessages("fr");

beforeAll(() => {
  // jsdom has no ResizeObserver; the text page measures its container width.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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

describe("AttachmentPreviewHost — un PDF ouvert pendant sa LECTURE", () => {
  const thumb = "data:image/png;base64,iVBORw0KGgo=";
  const reading = (masked?: boolean): Partial<Attachment> => ({
    text: "",
    extracting: true,
    extractProgress: { done: 1, total: 3 },
    reading: {
      total: 3,
      thumbs: [thumb, thumb, undefined],
      read: [true],
      ...(masked
        ? {
            masked: {
              pages: 1,
              chunks: [
                { text: "Emprunteur : " },
                { text: "Luc Martin", mark: { real: "Jean Dupont", tone: "violet", kind: "name", revealed: false } },
              ],
            },
          }
        : {}),
    },
  });

  it("les pages floutées, chacune avec son état", async () => {
    const m = await mount(<AttachmentPreviewHost preview={scan(reading())} onClose={() => {}} />);
    expect(document.body.querySelectorAll("img.fv-reading-thumb")).toHaveLength(2);
    expect(document.body.querySelector('[aria-label="' + fr.viewers.reading.pageRead(1) + '"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="' + fr.viewers.reading.pageCurrent(2) + '"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="' + fr.viewers.reading.pageWaiting(3) + '"]')).not.toBeNull();
    expect(document.body.textContent).toContain(fr.viewers.reading.note);
    await m.unmount();
  });

  it("les pages lues s'affichent MASQUÉES, provisoires — jamais la valeur réelle", async () => {
    const m = await mount(<AttachmentPreviewHost preview={scan(reading(true))} onClose={() => {}} />);
    const shown = document.body.textContent ?? "";
    expect(shown).toContain("Luc Martin");
    expect(shown).toContain(fr.viewers.partialNote);
    expect(shown).toContain(fr.viewers.reading.maskedPages(1, 3));
    expect(document.body.innerHTML).not.toContain("Jean Dupont");
    await m.unmount();
  });
});
