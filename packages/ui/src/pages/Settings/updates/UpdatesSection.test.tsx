// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { UpdatesSection } from "./UpdatesSection";
import { store } from "../../../state/redux";
import {
  resetSettingsCache,
  setReleaseNotesCache,
  setUpdatesCache,
} from "../../../state/settings/settingsCache";
import { mount } from "../../../testKit";
import type { Host } from "../../../host";

/**
 * THE VERSIONS MENU SAYS WHAT CHANGED — even when it has no build to list.
 *
 * The BUILD history (install, pin, revert) is rendered only on a staging build or for a
 * privileged device: everywhere else the page used to reduce to "The app is up to date",
 * with not a single version nor a line of what's new. Yet that is what this screen
 * promises. So both halves of the rule are pinned, because one without the other is
 * either a mute page, or the same list written twice.
 */

const NOTES = [
  {
    version: "0.5.0",
    releaseDate: "2026-08-11",
    title: "La console change de peau",
    body: "",
    highlights: ["feat: Nouveautés — un onglet dans l'aide"],
  },
  { version: "0.4.2", releaseDate: "2026-08-05", title: "Le redaction voit plus large", body: "", highlights: [] },
];

/** A minimal DESKTOP host: the whole section is hidden without `host.updates`. */
const updatesHost = (): Partial<Host> => ({
  releaseNotesUrl: "https://exemple.test/release-notes",
  updates: {
    current: async () => null,
    list: async () => ({ channel: "", releases: [] }),
    check: async () => {},
    pin: async () => {},
    install: async () => {},
    onStatus: () => () => {},
  } as unknown as Host["updates"],
});

const render = (host: Partial<Host> = updatesHost()) =>
  mount(<UpdatesSection />, {
    host,
    wrap: (children: ReactNode) => <Provider store={store}>{children}</Provider>,
  });

/** The cache as it is for an ordinary account: production build, no right
 *  to pin, no cross-environment view → the NON-technical view. */
const ordinaryDevice = () => {
  store.dispatch(
    setUpdatesCache({
      current: { version: "0.5.0", channel: "desktop-production" } as never,
      releases: [],
      canPin: false,
      allChannels: [],
      crossEnv: false,
      error: null,
    }),
  );
};

beforeEach(() => {
  store.dispatch(resetSettingsCache());
});

describe("Réglages → Versions — l'historique publié", () => {
  it("liste les versions publiées et leur contenu, la plus récente en tête", async () => {
    ordinaryDevice();
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render();

    expect(ui.findAll(".rn-version").map((v) => v.textContent)).toEqual(["0.5.0", "0.4.2"]);
    expect(ui.find(".rn-title").textContent).toBe("La console change de peau");
    // The Contentful CONTENT, not just the number: the note's bullet is rendered.
    expect(ui.find(".ver-rellist").textContent).toContain("un onglet dans l'aide");
    // The date is written in French, never the raw ISO.
    expect(ui.find(".rn-date").textContent).toBe("11 août 2026");

    await ui.unmount();
  });

  it("une liste vide se DIT — un blanc se lirait comme une panne", async () => {
    ordinaryDevice();
    store.dispatch(setReleaseNotesCache([]));
    const ui = await render();

    expect(ui.find(".ver-empty").textContent).toContain("Aucune note de version publiée");
    await ui.unmount();
  });

  it("sans source de notes (aperçu, relais coupé), aucune section vide n'apparaît", async () => {
    ordinaryDevice();
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({ updates: updatesHost().updates }); // no `releaseNotesUrl`

    expect(ui.maybe(".rn-list")).toBeNull();
    expect(ui.maybe(".ver-empty")).toBeNull();
    await ui.unmount();
  });

  it("sur un appareil privilégié la liste publiée ne DOUBLE pas l'historique des builds", async () => {
    // Technical view: each build already carries its note below its row. Re-showing the
    // published list underneath would write the same updates twice on the same screen.
    store.dispatch(
      setUpdatesCache({
        current: { version: "0.5.0", channel: "desktop-production" } as never,
        releases: [{ version: "0.5.0" } as never],
        canPin: true,
        allChannels: [],
        crossEnv: false,
        error: null,
      }),
    );
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render();

    expect(ui.maybe(".rn-list")).toBeNull();
    // …but the note IS there, attached to the build (the shared `ver-rellist` render).
    expect(ui.find(".ver-rellist").textContent).toContain("un onglet dans l'aide");
    await ui.unmount();
  });
});
