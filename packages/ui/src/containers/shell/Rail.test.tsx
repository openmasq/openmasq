// @vitest-environment jsdom
import { getMessages } from "@openmasq/i18n";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { store } from "../../state/redux";
import { mount } from "../../testKit";
import { Rail } from "./Rail";

/**
 * Le bouclier du rail PROMET le rapport de confidentialité — c'est ce que dit son
 * `aria-label` et sa bulle (« N élément(s) protégé(s) — rapport de confidentialité »).
 * Il partageait pourtant son geste avec l'avatar (`go("settings")`), donc il déposait
 * sur l'onglet par défaut : « Compte ». Pour une avocate, le rapport n'est pas un
 * gadget — c'est la pièce qui prouve que le secret professionnel a tenu ; un bouton qui
 * l'annonce et ouvre autre chose EMPÊCHE le geste au lieu de le servir.
 *
 * Le test épingle la DESTINATION, pas la couleur : l'onglet demandé doit être `privacy`
 * pour le bouclier, et l'onglet par défaut pour l'avatar.
 */
const wrap = (children: ReactNode) => <Provider store={store}>{children}</Provider>;

const railProps = (onOpenSettings: (tab?: string) => void) => ({
  conversations: [],
  onExpand: () => {},
  onNew: () => {},
  onSelect: () => {},
  onOpenSearch: () => {},
  onOpenSettings,
});

/* Les libellés viennent du CATALOGUE, pas d'une recopie : le test viserait sinon une
   chaîne française en dur dans une app qui bascule en anglais — et il tomberait à la
   première retouche de copie plutôt qu'à une vraie régression de comportement. */
const t = getMessages("fr");

describe("Rail — le bouclier mène au rapport de confidentialité", () => {
  it("le bouclier demande l'onglet « privacy »", async () => {
    const onOpenSettings = vi.fn();
    const m = await mount(<Rail {...railProps(onOpenSettings)} />, { wrap });
    await m.click(`[aria-label="${t.chrome.privacyReport}"]`);
    expect(onOpenSettings).toHaveBeenCalledWith("privacy");
    await m.unmount();
  });

  it("l'avatar garde l'onglet par défaut — les deux ne font PAS le même geste", async () => {
    const onOpenSettings = vi.fn();
    const m = await mount(<Rail {...railProps(onOpenSettings)} />, { wrap });
    await m.click(`[aria-label="${t.chrome.account}"]`);
    expect(onOpenSettings).toHaveBeenCalledWith();
    await m.unmount();
  });
});
