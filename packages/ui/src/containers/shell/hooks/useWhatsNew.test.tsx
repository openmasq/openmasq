// @vitest-environment jsdom
import { act } from "react";
import { Provider } from "react-redux";
import { describe, expect, it, beforeEach } from "vitest";
import { store } from "../../../state/redux";
import { resetSettingsCache, setReleaseNotesCache } from "../../../state/settings/settingsCache";
import { mount } from "../../../testKit";
import type { Host } from "../../../host";
import { useWhatsNew, type WhatsNewApi } from "./useWhatsNew";

/**
 * « WHAT'S NEW » after an update landed. Pinned: it shows the note of the version LANDED on,
 * only when main says one landed, never without a note, and closing it is final.
 */

const NOTE = { version: "0.15.3", releaseDate: "2026-10-08", title: "Plus calme", body: "", highlights: [] };

const hostWith = (landed: { from: string; to: string } | null): Partial<Host> => ({
  releaseNotesUrl: "https://exemple.test/release-notes",
  updates: { onStatus: () => () => {}, justUpdated: async () => landed } as unknown as Host["updates"],
});

function Probe({ out }: { out: { api?: WhatsNewApi } }) {
  out.api = useWhatsNew();
  return null;
}

const render = async (host: Partial<Host>) => {
  const out: { api?: WhatsNewApi } = {};
  const ui = await mount(<Probe out={out} />, {
    host,
    wrap: (children) => <Provider store={store}>{children}</Provider>,
  });
  await act(async () => {});
  return { ui, out };
};

beforeEach(() => {
  store.dispatch(resetSettingsCache());
  store.dispatch(setReleaseNotesCache({ notes: [NOTE], locale: "fr" }));
});

describe("useWhatsNew", () => {
  it("présente la note de la version sur laquelle ce lancement a atterri", async () => {
    const { ui, out } = await render(hostWith({ from: "0.15.2", to: "0.15.3" }));
    expect(out.api!.version).toBe("0.15.3");
    expect(out.api!.note?.title).toBe("Plus calme");
    await ui.unmount();
  });

  it("rien quand aucune mise à jour n'a été appliquée", async () => {
    const { ui, out } = await render(hostWith(null));
    expect(out.api!.version).toBeNull();
    await ui.unmount();
  });

  it("pas de note publiée ⇒ pas de modale (rien à dire)", async () => {
    const { ui, out } = await render(hostWith({ from: "0.15.3", to: "0.15.4" }));
    expect(out.api!.version).toBeNull();
    await ui.unmount();
  });

  it("fermée, elle ne revient pas", async () => {
    const { ui, out } = await render(hostWith({ from: "0.15.2", to: "0.15.3" }));
    await act(async () => out.api!.close());
    expect(out.api!.version).toBeNull();
    await ui.unmount();
  });

  it("un preload sans `justUpdated` : rien, sans erreur", async () => {
    const { ui, out } = await render({ updates: { onStatus: () => () => {} } as unknown as Host["updates"] });
    expect(out.api!.version).toBeNull();
    await ui.unmount();
  });
});
