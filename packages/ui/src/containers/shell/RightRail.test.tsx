// @vitest-environment jsdom
import { getMessages } from "@openmasq/i18n";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { store } from "../../state/redux";
import { readStylesheet } from "../../styles/readStylesheet";
import { mount } from "../../testKit";
import { RightRail } from "./RightRail";

/**
 * The right rail's DISCOVERABILITY, pinned: what it offers has to be reachable — by the
 * keyboard as well as the pointer, after a relaunch as well as before, and in the
 * sections without a side panel too.
 */
const wrap = (children: ReactNode) => <Provider store={store}>{children}</Provider>;
const t = getMessages("fr");

const props = (over: Partial<Parameters<typeof RightRail>[0]> = {}) => ({
  hostsPanel: true,
  browserTabs: [{ id: "a", label: "Exemple" }],
  activeBrowserTab: null,
  browserOnScreen: false,
  onNewBrowser: () => {},
  onSelectBrowserTab: () => {},
  onCloseBrowserTab: () => {},
  onOpenGuide: () => {},
  ...over,
});

beforeEach(() => localStorage.clear());

describe("RightRail — ce qu'elle offre se trouve", () => {
  it("garde son pied (aide, mise à jour) dans une section SANS panneau", async () => {
    const onOpenGuide = vi.fn();
    const onOpenUpdate = vi.fn();
    const m = await mount(
      <RightRail {...props({ hostsPanel: false, onOpenGuide, onOpenUpdate, updateVersion: "1.2.3" })} />,
      { wrap },
    );
    // No browser, no tabs — the panel doesn't live here…
    expect(m.findAll(`[aria-label="${t.shell.rightRail.openBrowser}"]`)).toHaveLength(0);
    expect(m.findAll(".right-rail-tab")).toHaveLength(0);
    // …but the doors that exist nowhere else stay.
    await m.click(`[aria-label="${t.chrome.help}"]`);
    await m.click(`[aria-label="${t.chrome.updateReady("1.2.3")}"]`);
    expect(onOpenGuide).toHaveBeenCalledOnce();
    expect(onOpenUpdate).toHaveBeenCalledOnce();
    await m.unmount();
  });

  it("se souvient de sa largeur d'un lancement à l'autre", async () => {
    const first = await mount(<RightRail {...props()} />, { wrap });
    expect(first.findAll(".right-rail.expanded")).toHaveLength(0);
    await first.click(`[aria-label="${t.shell.rightRail.expand}"]`);
    expect(first.findAll(".right-rail.expanded")).toHaveLength(1);
    await first.unmount();

    const again = await mount(<RightRail {...props()} />, { wrap });
    expect(again.findAll(".right-rail.expanded")).toHaveLength(1);
    await again.unmount();
  });

  it("la croix d'un onglet est un VRAI bouton, à côté de la ligne et pas dedans", async () => {
    localStorage.setItem("openmasq.rightRailExpanded", "1");
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const m = await mount(
      <RightRail {...props({ onSelectBrowserTab: onSelect, onCloseBrowserTab: onClose })} />,
      { wrap },
    );
    // A button inside a button has no tab stop: the cross was mouse-only.
    expect(m.findAll("button button")).toHaveLength(0);
    await m.click(`[aria-label="${t.shell.rightRail.closeItem("Exemple")}"]`);
    expect(onClose).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("dit à qui est le navigateur, ouvert ou vide", async () => {
    const narrow = await mount(<RightRail {...props({ browserTabs: [] })} />, { wrap });
    expect(narrow.findAll(`[aria-label="${t.shell.rightRail.openBrowser}"]`)).toHaveLength(1);
    await narrow.click(`[aria-label="${t.shell.rightRail.expand}"]`);
    expect(narrow.find(".rr-empty").textContent).toBe(t.shell.rightRail.noTabs);
    await narrow.unmount();
  });
});

describe("les contrôles révélés au survol restent atteignables au clavier", () => {
  // `display: none` takes a control out of the tab order, so a `:focus-visible` rule on it
  // never fires: these crosses and « Demander » hide by OPACITY instead.
  const css = readStylesheet();
  for (const sel of [".right-rail-x", ".rr-item-x", ".rr-tree-ask"]) {
    it(`${sel} ne se cache jamais par display:none`, () => {
      const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) =>
        s.split(",").some((x) => x.trim().split(/\s+/).pop() === sel),
      );
      expect(rules.length).toBeGreaterThan(0);
      for (const [, , body] of rules) expect(body).not.toMatch(/display:\s*none/);
    });
  }
});
