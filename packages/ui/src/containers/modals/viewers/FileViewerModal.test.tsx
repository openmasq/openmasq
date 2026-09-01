// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { HostProvider, type Host } from "../../../host";
import { ChatStoreProvider } from "../../providers/chatStore";
import type { ChatStore } from "../../../state/store";
import { FileViewerModal } from "./FileViewerModal";
import { mount } from "../../../testKit";
import type { LoadedFile } from "./FileViewerBody";

/**
 * The Redacted ⇄ Original toggle (requested 14/08): the viewer always OPENS on the
 * redacted version — the only one safe to have on screen — and showing the original is
 * a switch on the note row, whose state persists nowhere. On a file WITHOUT
 * redaction, the row doesn't exist: the UI never claims a
 * masking that never happened.
 */

beforeAll(() => {
  // jsdom has no ResizeObserver; the text page measures its container width.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const bytes = (s: string) => new TextEncoder().encode(s);
const FILE: LoadedFile = {
  name: "note.txt",
  mime: "text/plain",
  original: bytes("Jean Rebour habite ici."),
  scrubbed: bytes("Luc Morvan habite ici."),
  extraction: {
    redactions: [{ real: "Jean Rebour", fake: "Luc Morvan", tone: "blue", kind: "person" }],
  },
};

const host = {} as unknown as Host;
const store = { settings: {} } as unknown as ChatStore;
const modal = (over: Partial<Parameters<typeof FileViewerModal>[0]> = {}) => (
  <HostProvider value={host}>
    <ChatStoreProvider store={store}>
      <FileViewerModal
      id="f1"
      name="note.txt"
      mime="text/plain"
      onClose={() => {}}
      loadFile={async () => FILE}
      redacted
        {...over}
      />
    </ChatStoreProvider>
  </HostProvider>
);

describe("FileViewerModal — la bascule Redacted ⇄ Original", () => {
  it("ouvre redacted ; l'interrupteur révèle l'original, et la note dit VRAI des deux côtés", async () => {
    const m = await mount(modal());
    // The load is async: re-render to let loadFile settle.
    await m.rerender(modal());

    // Opening state: redacted, note « Données masquées », switch checked.
    expect(m.find(".fv-seg-note").className).toContain("fv-seg-masked");
    expect(m.find(".fv-seg-note").textContent).toMatch(/masquées/i);
    expect(m.find(".fv-seg-toggle .cv-switch").getAttribute("aria-checked")).toBe("true");

    await m.click(".fv-seg-toggle .cv-switch");
    expect(m.find(".fv-seg-note").className).toContain("fv-seg-clear");
    expect(m.find(".fv-seg-note").textContent).toMatch(/original/i);
    expect(m.find(".fv-seg-toggle .cv-switch").getAttribute("aria-checked")).toBe("false");
    await m.unmount();
  });

  it("la carte de dépôt SUFFIT : un appelant qui ne sait pas dire `redacted` ne cache pas la bascule", async () => {
    // The gap found on 14/08: MessageBubble / PanelFileView weren't passing the
    // flag — the entire row disappeared even though the viewer PAINTED the redaction.
    const m = await mount(modal({ redacted: undefined }));
    await m.rerender(modal({ redacted: undefined }));
    expect(m.maybe(".fv-seg-toggle")).not.toBeNull();
    await m.unmount();
  });

  it("sans redaction (ni drapeau ni carte), NI ligne NI interrupteur — pas de masquage revendiqué à tort", async () => {
    const clean: LoadedFile = { name: "note.txt", mime: "text/plain", original: bytes("rien"), scrubbed: null };
    const props = { redacted: false, loadFile: async () => clean };
    const m = await mount(modal(props));
    await m.rerender(modal(props));
    expect(m.maybe(".fv-seg-row")).toBeNull();
    expect(m.maybe(".fv-seg-toggle")).toBeNull();
    await m.unmount();
  });
});
