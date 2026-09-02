// @vitest-environment jsdom
import { getMessages } from "@openmasq/i18n";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { store } from "../../state/redux";
import { sectionGuides } from "../../help";
import { mount } from "../../testKit";
import { Rail } from "./Rail";

/**
 * The rail's shield PROMISES the privacy report — that's what its
 * `aria-label` and its tooltip say (« N élément(s) protégé(s) — rapport de confidentialité »).
 * Yet it shared its gesture with the avatar (`go("settings")`), so it used to land
 * on the default tab: « Compte ». For a lawyer, the report isn't a
 * gimmick — it's the piece that proves professional secrecy held; a button that
 * announces it and opens something else PREVENTS the gesture instead of serving it.
 *
 * The test pins the DESTINATION, not the colour: the requested tab must be `privacy`
 * for the shield, and the default tab for the avatar.
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

/* The labels come from the CATALOGUE, not a copy-paste: otherwise the test would target a
   hardcoded French string in an app that switches to English — and it would fail at the
   first copy tweak rather than at a real behaviour regression. */
const t = getMessages("fr");

describe("Rail — les sections viennent de l'unique vocabulaire", () => {
  it("rend chaque section de `sectionGuides`, dans l'ordre, avec son tip pour bulle", async () => {
    const m = await mount(<Rail {...railProps(() => {})} />, { wrap });
    const nav = m.findAll(".rail-nav");
    expect(nav.map((b) => b.getAttribute("aria-label"))).toEqual(sectionGuides(t).map((s) => s.label));
    // The tooltip is the `title` (drawn by TooltipLayer), never a private mechanism.
    expect(nav.map((b) => b.getAttribute("title"))).toEqual(sectionGuides(t).map((s) => s.tip));
    expect(m.findAll("[data-tip]")).toHaveLength(0);
    await m.unmount();
  });
});

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
