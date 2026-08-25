// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { HostProvider, type Host } from "../../../host";
import { ChatStoreProvider } from "../../providers/chatStore";
import type { ChatStore } from "../../../state/store";
import { FileViewerModal } from "./FileViewerModal";
import { mount } from "../../../testKit";
import type { LoadedFile } from "./FileViewerBody";

/**
 * La bascule Redacted ⇄ Original (demandée 14/08) : le viewer OUVRE toujours sur la
 * version redacted — la seule sûre à avoir à l'écran — et montrer l'original est un
 * interrupteur dans la ligne de note, dont l'état ne se persiste nulle part. Sur un
 * fichier SANS redaction la ligne n'existe pas : l'UI ne revendique jamais un
 * masquage qui n'a pas eu lieu.
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
    // Le chargement est async : re-render pour laisser le loadFile se poser.
    await m.rerender(modal());

    // État d'ouverture : redacted, note « Données masquées », interrupteur coché.
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
    // Le trou constaté le 14/08 : MessageBubble / PanelFileView ne passaient pas le
    // drapeau — la ligne entière disparaissait alors que le viewer PEIGNAIT le redaction.
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
