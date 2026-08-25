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
} from "../../../state/settingsCache";
import { mount } from "../../../testKit";
import type { Host } from "../../../host";

/**
 * LE MENU VERSIONS DIT CE QUI A CHANGÉ — même quand il n'a aucune build à lister.
 *
 * L'historique des BUILDS (installer, épingler, revenir) n'est rendu que sur une build de
 * staging ou pour un appareil privilégié : partout ailleurs la page se réduisait à « L'app
 * est à jour », sans une seule version ni une ligne de nouveautés. Or c'est ce que cet écran
 * promet. On épingle donc les deux moitiés de la règle, parce que l'une sans l'autre est
 * soit une page muette, soit la même liste écrite deux fois.
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

/** Un hôte de BUREAU minimal : la section entière est masquée sans `host.updates`. */
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

/** Le cache tel qu'il est chez un compte ordinaire : build de production, aucun droit
 *  d'épingler, aucune vue inter-environnements → la vue NON technique. */
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
    // Le CONTENU Contentful, pas seulement le numéro : la puce de la note est rendue.
    expect(ui.find(".ver-rellist").textContent).toContain("un onglet dans l'aide");
    // La date est écrite en français, jamais l'ISO brut.
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
    const ui = await render({ updates: updatesHost().updates }); // pas de `releaseNotesUrl`

    expect(ui.maybe(".rn-list")).toBeNull();
    expect(ui.maybe(".ver-empty")).toBeNull();
    await ui.unmount();
  });

  it("sur un appareil privilégié la liste publiée ne DOUBLE pas l'historique des builds", async () => {
    // Vue technique : chaque build porte déjà sa note sous sa ligne. Réafficher la liste
    // publiée en dessous écrirait deux fois les mêmes nouveautés sur le même écran.
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
    // …mais la note EST là, attachée à la build (le rendu partagé `ver-rellist`).
    expect(ui.find(".ver-rellist").textContent).toContain("un onglet dans l'aide");
    await ui.unmount();
  });
});
