// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { GuideModal } from "./GuideModal";
import { getMessages } from "@openmasq/i18n";
import { guideChapters, HELP_CENTER_URL } from "../../help";
import { store } from "../../state/redux";
import { resetSettingsCache, setReleaseNotesCache } from "../../state/settingsCache";
import { mount } from "../../testKit";
import type { Host } from "../../host";
import { brandUrl } from "@openmasq/branding";

/** The guide is a menu by THEME + a single displayed chapter — not one column to
 *  scroll through entirely. Pins: every theme is in the summary, clicking one shows ITS content. */
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

/* The modal renders the default language's catalog outside a provider — so that's
   the one the test expects. */
const GUIDE = guideChapters(getMessages("fr"));

describe("GuideModal — sommaire par thème", () => {
  it("tous les chapitres sont au menu, un seul est affiché, et le clic change lequel", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    expect(titles(ui)).toEqual(GUIDE.map((c) => c.title));
    // A single chapter rendered, the first one by default.
    expect(ui.findAll(".guide-chapter")).toHaveLength(1);
    expect(ui.find(".guide-chapter-title").textContent).toBe(GUIDE[0].title);

    // Clicking the last theme shows ITS content (and marks the entry active).
    const items = ui.findAll(".guide-nav-item");
    const last = items[items.length - 1];
    await ui.click(last);
    expect(ui.find(".guide-chapter-title").textContent).toBe(GUIDE.at(-1)!.title);
    expect(last.classList.contains("on")).toBe(true);

    await ui.unmount();
  });

  /**
   * The in-app guide is short by design; the full documentation is online.
   * The link to it therefore lives in the header (so it's visible from EVERY
   * chapter), and it opens through the SYSTEM browser: a `target="_blank"` that the
   * main process filters by scheme. Losing it would let the guide pass itself
   * off as all the help that exists.
   */
  it("l'en-tête porte le lien vers le centre d'aide étendu, sortant vers le navigateur", async () => {
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    const cta = ui.find<HTMLAnchorElement>(".guide-head-cta");
    expect(cta.getAttribute("href")).toBe(HELP_CENTER_URL);
    expect(HELP_CENTER_URL).toBe(brandUrl("help"));
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toContain("noreferrer");
    // It carries the brand's call to action, and stays there regardless of chapter.
    expect(cta.classList.contains("btn-primary")).toBe(true);
    await ui.click(ui.findAll(".guide-nav-item").at(-1)!);
    expect(ui.maybe(".guide-head-cta")).not.toBeNull();

    await ui.unmount();
  });
});

/**
 * VERSION HISTORY IN THE HELP — the published notes (Contentful) can be read without
 * leaving the app. Two things are worth pinning: that the chapter RENDERS the cache's
 * notes, and that it DISAPPEARS where this source doesn't exist — a tab that can display
 * nothing reads as an app failure, not as an absence of content.
 */
describe("GuideModal — l'onglet « Nouveautés »", () => {
  it("liste les versions publiées, la plus récente en tête", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });

    await ui.click(ui.findAll(".guide-nav-item").find((i) => i.textContent === "Nouveautés")!);
    const versions = ui.findAll(".rn-version").map((v) => v.textContent);
    expect(versions).toEqual(["0.4.2", "0.4.1"]);
    expect(ui.find(".rn-title").textContent).toBe("Le redaction voit plus large");
    // The bullet keeps its release-note formatting (the same render as in Réglages).
    expect(ui.find(".ver-rellist").textContent).toContain("Adresses");
    // The date is written in French, never the raw ISO.
    expect(ui.find(".rn-date").textContent).toBe("5 août 2026");

    await ui.unmount();
  });

  it("sans source de notes (aperçu navigateur), le chapitre n'existe pas", async () => {
    store.dispatch(setReleaseNotesCache(NOTES));
    const ui = await render({}); // no `releaseNotesUrl`
    expect(titles(ui)).not.toContain("Nouveautés");
    await ui.unmount();
  });

  it("demande les notes lui-même — on ouvre l'aide sans être passé par les Réglages", async () => {
    // The prefetch lives in Réglages; help opens from the rail. Without this
    // request, the tab would be empty for anyone who never opened Réglages.
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items: NOTES }) }));
    vi.stubGlobal("fetch", fetchMock);
    store.dispatch(resetSettingsCache()); // cache never loaded → `loading` true

    const ui = await render({ releaseNotesUrl: "https://exemple.test/release-notes" });
    await ui.click(ui.findAll(".guide-nav-item").find((i) => i.textContent === "Nouveautés")!);
    expect(fetchMock).toHaveBeenCalledWith("https://exemple.test/release-notes");

    await ui.unmount();
  });
});
