// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { AppearanceSection } from "./AppearanceSection";
import { I18nProvider } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { LOCALE_KEY } from "../../state/locale";
import { mount } from "../../testKit";
import type { Settings } from "../../types";

/**
 * LE SÉLECTEUR DE LANGUE DOIT ÉCRIRE AUX DEUX ENDROITS — et rester lisible dans la langue
 * qu'on ne comprend pas.
 *
 * C'est la seule commande de l'app qu'on vient chercher PARCE QU'ON NE COMPREND PAS ce qui
 * s'affiche. Deux règles en découlent, et une seule des deux ne suffit jamais :
 *
 *  1. les options portent des ENDONYMES, pas des noms traduits — « English » doit se lire
 *     « English » quand l'app est en français, sinon l'anglophone ne trouve pas sa ligne ;
 *  2. le choix s'écrit à la fois dans la clé d'APPAREIL (relue avant le premier paint, donc
 *     pas de flash de langue au démarrage) ET dans `Settings.language` (qui voyage avec le
 *     compte). Une seule des deux écritures donne soit un clignotement au boot, soit un
 *     réglage qui ne suit pas l'utilisateur sur son second appareil.
 */

/** Les Réglages montent un brouillon VIVANT (`useSettingsDraft` le lie au store) ; ici un
 *  `useState` joue le même rôle, et `seen` laisse le test lire son état final. */
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

    // Des endonymes : l'app est en français, « English » ne devient pas « Anglais ».
    expect(ui.findAll(".om-seg-btn").map((b) => b.textContent)).toEqual(["Français", "English"]);
    // Le réglage synchronisé décide de la case cochée — une seule.
    expect(
      ui.findAll(".om-seg-btn").filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent),
    ).toEqual(["English"]);
    // Le thème n'a pas été perdu en route : la section porte toujours ses deux lignes.
    expect(ui.findAll(".toggle-row")).toHaveLength(2);

    await ui.unmount();
  });

  it("choisir une langue l'écrit DANS LES DEUX : la clé d'appareil et les réglages", async () => {
    const seen = { current: DEFAULT_SETTINGS };
    const ui = await mount(<Harness initial={DEFAULT_SETTINGS} seen={seen} />, { wrap: inFrench });

    await ui.click(ui.findAll(".om-seg-btn")[1]); // « English »

    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    expect(seen.current.language).toBe("en");

    await ui.unmount();
  });

  it("hors provider (aperçu web), le bouton ne ment pas : la préférence est quand même posée", async () => {
    // Sans `I18nProvider` il n'y a aucun catalogue à basculer à chaud — mais un bouton qui
    // n'enregistre RIEN serait pire qu'absent. `useLocale` retombe sur l'écriture de la clé
    // d'appareil, donc le choix s'applique au démarrage suivant.
    const seen = { current: DEFAULT_SETTINGS };
    const ui = await mount(<Harness initial={DEFAULT_SETTINGS} seen={seen} />);

    await ui.click(ui.findAll(".om-seg-btn")[1]);

    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    expect(seen.current.language).toBe("en");

    await ui.unmount();
  });
});
