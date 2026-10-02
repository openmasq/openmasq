// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../testKit";
import { AttachmentPreviewHost } from "./AttachmentPreviewHost";
import type { Attachment } from "./Composer";

const fr = getMessages("fr");

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
