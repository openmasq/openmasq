// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { ComposerRedactMenu, type RedactLevelApi } from "./ComposerRedactMenu";
import { PrivacyLevelPicker } from "../../components/PrivacyLevelPicker";
import { getMessages } from "@openmasq/i18n";
import { privacyLevelMeta } from "../../privacy/privacyLevel";

/**
 * The click SETS the level, and it sets it on THE CONVERSATION: the composer acts on
 * what's in front of you. The global default changes where it's weighed. The only exception
 * is forced — without a conversation, there is nothing to override — and the menu SAYS
 * which of the two it is about to do.
 */
const snap = { scope: "default" as const, cats: {} as never };
const api = (over: Partial<RedactLevelApi> = {}): RedactLevelApi => ({
  level: "renforce",
  bars: 2,
  overridden: false,
  forcedCount: 0,
  onApplyConversation: vi.fn(() => ({
    scope: "conversation" as const,
    convId: "c1",
    cats: undefined,
  })),
  onApplyAlways: vi.fn(() => snap),
  restore: vi.fn(),
  ...over,
});
const fr = getMessages("fr");

const cardNamed = (m: Awaited<ReturnType<typeof mount>>, label: string): Element =>
  m.findAll(".crm-level").find((el) => el.querySelector(".crm-level-name")?.textContent === label)!;

const arrow = async (key: string) => {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

describe("ComposerRedactMenu", () => {
  it("un clic pose le niveau sur la CONVERSATION, ferme, et remonte ce qui a été appliqué", async () => {
    const onDone = vi.fn();
    const a = api();
    const m = await mount(<ComposerRedactMenu api={a} onDone={onDone} />);
    await m.click(cardNamed(m, "Strict"));
    expect(a.onApplyConversation).toHaveBeenCalledWith("strict");
    expect(a.onApplyAlways).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({
      level: "strict",
      scope: "conversation",
      snap: { scope: "conversation", convId: "c1", cats: undefined },
    });
    await m.unmount();
  });

  /* Without a conversation (first message), there is nothing to override: the default
     receives it — otherwise the gesture would do nothing at all. */
  it("sans conversation, le clic écrit le DÉFAUT", async () => {
    const onDone = vi.fn();
    const a = api({ onApplyConversation: undefined });
    const m = await mount(<ComposerRedactMenu api={a} onDone={onDone} />);
    await m.click(cardNamed(m, "Allégé"));
    expect(a.onApplyAlways).toHaveBeenCalledWith("standard");
    expect(onDone).toHaveBeenCalledWith({ level: "standard", scope: "default", snap });
    await m.unmount();
  });

  /* The scope is SAID before the click: on the home screen the same gesture rewrites
     every future thread, and nothing else on screen would say so. */
  it("annonce la portée avant le clic — la conversation, ou le défaut", async () => {
    const conv = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    expect(conv.find(".crm-scope").textContent).toBe(fr.composer.scopeConversation);
    await conv.unmount();
    const none = await mount(
      <ComposerRedactMenu api={api({ onApplyConversation: undefined })} onDone={() => {}} />,
    );
    expect(none.find(".crm-scope").textContent).toBe(fr.composer.scopeDefault);
    await none.unmount();
  });

  it("la coche marque le niveau EN VIGUEUR, et lui seul", async () => {
    const m = await mount(
      <ComposerRedactMenu api={api({ level: "renforce" })} onDone={() => {}} />,
    );
    expect(cardNamed(m, "Renforcé").querySelector(".crm-level-check")).not.toBeNull();
    expect(cardNamed(m, "Allégé").querySelector(".crm-level-check")).toBeNull();
    expect(cardNamed(m, "Strict").querySelector(".crm-level-check")).toBeNull();
    await m.unmount();
  });

  /* « Sur mesure » is a state, not a choice: shown checked, never a button — and the
     three presets stay unchecked, because none of them is what's active. */
  it("« Sur mesure » s'affiche coché, non cliquable, avec sa note", async () => {
    const m = await mount(
      <ComposerRedactMenu api={api({ level: "custom", bars: 3 })} onDone={() => {}} />,
    );
    const custom = m.find(".crm-level.custom");
    expect(custom.tagName).toBe("DIV");
    expect(custom.getAttribute("aria-checked")).toBe("true");
    expect(custom.textContent).toContain(fr.leaves.privacyLevels.customNote);
    expect(m.findAll("button.crm-level[aria-checked='true']")).toHaveLength(0);
    await m.unmount();
  });

  /* The glyph IS the scale: the THREE bars are always there, and it's the number of
     BOLD bars that states the level. Drawing only N of them lost the comparison — a
     single bar compares to nothing — and made the button's footprint jump from one
     level to another. */
  it("les trois traits sont toujours là ; seul le nombre de GRAS varie", async () => {
    const m = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const paths = (label: string) => [
      ...cardNamed(m, label).querySelectorAll(".crm-level-ico svg path"),
    ];
    const bold = (label: string) =>
      paths(label).filter((p) => Number(p.getAttribute("stroke-width")) > 2).length;
    expect(paths("Allégé")).toHaveLength(3);
    expect(paths("Renforcé")).toHaveLength(3);
    expect(paths("Strict")).toHaveLength(3);
    expect([bold("Allégé"), bold("Renforcé"), bold("Strict")]).toEqual([1, 2, 3]);
    await m.unmount();
  });

  /* The text comes from `privacyLevelMeta`, never from the component: a second surface
     that rewrote the levels would be two vocabularies (rule 9). The trade-off rides
     along — it is the counterpart rule 8 imposes, on the surface where one lowers the
     guard in passing — and the REDUCED level wears the eye, as in Réglages. */
  it("descriptions, contreparties et l'œil du niveau réduit sortent du vocabulaire partagé", async () => {
    const m = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const meta = privacyLevelMeta(fr);
    // The USE then the COVERAGE — the same two sentences Réglages' picker renders.
    expect(m.findAll(".crm-level-desc").map((el) => el.textContent)).toEqual(
      meta.map((x) => `${x.desc} ${x.short}`),
    );
    expect(m.findAll(".crm-level-tradeoff").map((el) => el.textContent)).toEqual(
      meta.map((x) => x.tradeoff),
    );
    for (const x of meta) {
      expect(cardNamed(m, x.label).querySelector(".crm-level-flag") !== null).toBe(!!x.reduced);
    }
    await m.unmount();
  });

  /* Two doors, ONE vocabulary: the composer menu and Réglages' picker must say the
     same thing about each level, word for word — a card rewritten on one surface is
     the start of two products. */
  it("dit exactement ce que dit le sélecteur des Réglages, carte par carte", async () => {
    const menu = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const picker = await mount(<PrivacyLevelPicker level="renforce" onPick={() => {}} />);
    const text = (els: Element[]) => els.map((el) => el.textContent?.trim());
    expect(text(menu.findAll(".crm-level-desc"))).toEqual(text(picker.findAll(".privacy-level-desc")));
    expect(text(menu.findAll(".crm-level-tradeoff"))).toEqual(
      text(picker.findAll(".privacy-level-tradeoff")),
    );
    expect(text(menu.findAll(".crm-level-name"))).toEqual(text(picker.findAll(".privacy-level-name")));
    await menu.unmount();
    await picker.unmount();
  });

  /* The level below the default is NAMED as such: « Allégé », never « Standard » —
     a « standard » that protects less than the default reads as the norm. The id stays
     `standard` because it is persisted in the settings. */
  it("le niveau réduit s'appelle « Allégé » et sa carte dit qu'il protège moins", async () => {
    const reduced = privacyLevelMeta(fr).find((x) => x.reduced)!;
    expect(reduced.id).toBe("standard");
    expect(reduced.label).toBe("Allégé");
    expect(reduced.desc).toMatch(/protège moins/);
  });

  /* Org-mandated categories stay on whatever the card says — the menu says so, or a
     member picking « Standard » believes they just turned them off. */
  it("dit combien de catégories l'organisation impose, seulement s'il y en a", async () => {
    const none = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    expect(none.maybe(".crm-lock")).toBeNull();
    await none.unmount();
    const some = await mount(
      <ComposerRedactMenu api={api({ forcedCount: 2 })} onDone={() => {}} />,
    );
    expect(some.find(".crm-lock").textContent).toContain(fr.composer.forcedNote(2));
    await some.unmount();
  });

  /* A popover that opens without moving focus is invisible to the keyboard: focus lands
     on the card in force, and the arrows walk the scale (a roving tabindex). */
  it("prend le focus sur le niveau en vigueur, et les flèches parcourent l'échelle", async () => {
    const m = await mount(
      <ComposerRedactMenu api={api({ level: "renforce" })} onDone={() => {}} />,
    );
    expect(document.activeElement).toBe(cardNamed(m, "Renforcé"));
    expect(cardNamed(m, "Renforcé").getAttribute("tabindex")).toBe("0");
    expect(cardNamed(m, "Allégé").getAttribute("tabindex")).toBe("-1");
    await arrow("ArrowDown");
    expect(document.activeElement).toBe(cardNamed(m, "Strict"));
    await arrow("ArrowDown");
    expect(document.activeElement).toBe(cardNamed(m, "Allégé"));
    await arrow("End");
    expect(document.activeElement).toBe(cardNamed(m, "Strict"));
    await m.unmount();
  });
});
