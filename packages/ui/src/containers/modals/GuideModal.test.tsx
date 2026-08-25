// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { GuideModal } from "./GuideModal";
import { GUIDE, HELP_CENTER_URL } from "../../help";
import { store } from "../../state/redux";
import { resetSettingsCache, setReleaseNotesCache } from "../../state/settingsCache";
import { mount } from "../../testKit";
import type { Host } from "../../host";
import { brandUrl } from "@openmasq/branding";

/** Le guide est un menu par THÈME + un seul chapitre affiché — pas une colonne à tout
 *  dérouler. Épingle : chaque thème est au sommaire, cliquer l'un affiche SON contenu. */
const NOTES = [
  { version: "0.4.2", releaseDate: "2026-08-05", title: "Le redaction voit plus large", body: "", highlights: ["feat: Adresses — les compléments aussi"] },
  { version: "0.4.1", releaseDate: "2026-07-28", title: "Réglages plus courts", body: "", highlights: [] },
];

const render = (host: Partial<Host>) =>
  mount(<GuideModal onClose={() => {}} />, {
    host,
    wrap: (children: ReactNode) => <Provider store={store}>{children}</Provider>,
  });

const titles = (ui: Awaited<ReturnType<typeof render>>) =>
  ui.findAll(".guide-nav-item").map((i) => i.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuideModal — sommaire par thème", () => {
  it("tous les chapitres sont au menu, un seul est affiché, et le clic change lequel", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    expect(titles(ui)).toEqual(GUIDE.map((c) => c.title));
    // Un seul chapitre rendu, le premier par défaut.
    expect(ui.findAll(".guide-chapter")).toHaveLength(1);
    expect(ui.find(".guide-chapter-title").textContent).toBe(GUIDE[0].title);

    // Cliquer le dernier thème affiche SON contenu (et marque l'entrée active).
    const items = ui.findAll(".guide-nav-item");
    const last = items[items.length - 1];
    await ui.click(last);
    expect(ui.find(".guide-chapter-title").textContent).toBe(GUIDE.at(-1)!.title);
    expect(last.classList.contains("on")).toBe(true);

    await ui.unmount();
  });

  /**
   * Le guide dans l'app est court par construction ; la documentation complète est en
   * ligne. Le lien vers elle est donc de l'en-tête (donc visible depuis TOUS les
   * chapitres), et il sort par le navigateur SYSTÈME : un `target="_blank"` que le
   * processus principal filtre par schéma. Le perdre, c'est laisser le guide se faire
   * passer pour toute l'aide qui existe.
   */
  it("l'en-tête porte le lien vers le centre d'aide étendu, sortant vers le navigateur", async () => {
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    const cta = ui.find<HTMLAnchorElement>(".guide-head-cta");
    expect(cta.getAttribute("href")).toBe(HELP_CENTER_URL);
    expect(HELP_CENTER_URL).toBe(brandUrl("help"));
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toContain("noreferrer");
    // Il porte l'appel à l'action de la marque, et reste là quel que soit le chapitre.
    expect(cta.classList.contains("btn-primary")).toBe(true);
    await ui.click(ui.findAll(".guide-nav-item").at(-1)!);
    expect(ui.maybe(".guide-head-cta")).not.toBeNull();

    await ui.unmount();
  });
});

/**
 * L'HISTORIQUE DES VERSIONS DANS L'AIDE — les notes publiées (Contentful) se lisent sans
 * quitter l'app. Deux choses valent d'être épinglées : que le chapitre RENDE les notes du
 * cache, et qu'il DISPARAISSE là où cette source n'existe pas — un onglet qui ne peut rien
 * afficher se lit comme une panne de l'app, pas comme une absence de contenu.
 */
describe("GuideModal — l'onglet « Nouveautés »", () => {
  it("liste les versions publiées, la plus récente en tête", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    await ui.click(ui.findAll(".guide-nav-item").find((i) => i.textContent === "Nouveautés")!);
    const versions = ui.findAll(".rn-version").map((v) => v.textContent);
    expect(versions).toEqual(["0.4.2", "0.4.1"]);
    expect(ui.find(".rn-title").textContent).toBe("Le redaction voit plus large");
    // La puce garde sa mise en forme de note de version (le même rendu qu'aux Réglages).
    expect(ui.find(".ver-rellist").textContent).toContain("Adresses");
    // La date est écrite en français, jamais l'ISO brut.
    expect(ui.find(".rn-date").textContent).toBe("5 août 2026");

    await ui.unmount();
  });

  it("sans source de notes (aperçu navigateur), le chapitre n'existe pas", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({}); // pas de `releaseNotesUrl`
    expect(titles(ui)).not.toContain("Nouveautés");
    await ui.unmount();
  });

  it("demande les notes lui-même — on ouvre l'aide sans être passé par les Réglages", async () => {
    // Le préchargement vit dans Réglages ; l'aide s'ouvre depuis le rail. Sans cette
    // demande, l'onglet serait vide chez qui n'a jamais ouvert les Réglages.
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items: NOTES }) }));
    vi.stubGlobal("fetch", fetchMock);
    store.dispatch(resetSettingsCache()); // cache jamais chargé → `loading` vrai

    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });
    await ui.click(ui.findAll(".guide-nav-item").find((i) => i.textContent === "Nouveautés")!);
    expect(fetchMock).toHaveBeenCalledWith("https://exemple.test/release-notes");

    await ui.unmount();
  });
});
