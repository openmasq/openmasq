// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { AppearanceSection } from "./AppearanceSection";
import { I18nProvider } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { LOCALE_KEY } from "../../state/settings/locale";
import { mount } from "../../testKit";
import type { Settings } from "../../types";

/**
 * THE LANGUAGE PICKER MUST WRITE IN BOTH PLACES — and stay readable in the language
 * you don't understand.
 *
 * It's the one control in the app you come looking for BECAUSE YOU DON'T UNDERSTAND what's
 * displayed. Two rules follow from that, and neither one alone is ever enough:
 *
 *  1. the options carry ENDONYMS, not translated names — "English" must read as
 *     "English" when the app is in French, otherwise the English speaker can't find their row;
 *  2. the choice is written both to the DEVICE key (re-read before the first paint, so
 *     no language flash on startup) AND to `Settings.language` (which travels with the
 *     account). Either write alone gives either a flicker at boot, or a
 *     setting that doesn't follow the user to their second device.
 */

/** Réglages mounts a LIVE draft (`useSettingsDraft` binds it to the store); here a
 *  `useState` plays the same role, and `seen` lets the test read its final state. */
function Harness({ initial, seen }: { initial: Settings; seen: { current: Settings } }) {
  const [draft, setDraft] = useState(initial);
  seen.current = draft;
  return <AppearanceSection draft={draft} setDraft={setDraft} />;
}

const inFrench = (children: ReactNode) => <I18nProvider locale="fr">{children}</I18nProvider>;

beforeEach(() => {
  localStorage.clear();
});

describe("Réglages → Apparence — le sélecteur de langue", () => {
  it("nomme chaque langue dans SA langue, et ne coche que celle qui est active", async () => {
    const seen = { current: DEFAULT_SETTINGS };
    const ui = await mount(
      <Harness initial={{ ...DEFAULT_SETTINGS, language: "en" }} seen={seen} />,
      { wrap: inFrench },
    );

    // Endonyms: the app is in French, "English" doesn't become "Anglais".
    expect(ui.findAll(".om-seg-btn").map((b) => b.textContent)).toEqual(["Français", "English"]);
    // The synced setting decides the checked box — a single one.
    expect(
      ui.findAll(".om-seg-btn").filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent),
    ).toEqual(["English"]);
    // The theme wasn't lost along the way: the section still carries its two rows.
    expect(ui.findAll(".toggle-row")).toHaveLength(2);

    await ui.unmount();
  });

  it("choisir une langue l'écrit DANS LES DEUX : la clé d'appareil et les réglages", async () => {
    const seen = { current: DEFAULT_SETTINGS };
    const ui = await mount(<Harness initial={DEFAULT_SETTINGS} seen={seen} />, { wrap: inFrench });

    await ui.click(ui.findAll(".om-seg-btn")[1]); // "English"

    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    expect(seen.current.language).toBe("en");

    await ui.unmount();
  });

  it("hors provider (aperçu web), le bouton ne ment pas : la préférence est quand même posée", async () => {
    // Without `I18nProvider` there's no catalogue to hot-swap — but a button that
    // saves NOTHING would be worse than none at all. `useLocale` falls back to writing the
    // device key, so the choice applies on the next startup.
    const seen = { current: DEFAULT_SETTINGS };
    const ui = await mount(<Harness initial={DEFAULT_SETTINGS} seen={seen} />);

    await ui.click(ui.findAll(".om-seg-btn")[1]);

    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    expect(seen.current.language).toBe("en");

    await ui.unmount();
  });
});
