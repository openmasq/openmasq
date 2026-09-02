// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { configurePlatformAccess } from "../../send/platformAccess";
import { ModelRow } from "./ModelRow";
import type { ModelInfo } from "@openmasq/llm";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const act: (cb: () => Promise<void> | void) => Promise<void> = (
  React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }
).act;

/**
 * A gated row is the FIRST place a user meets the paid-model question, and it used to be
 * a dead end: the one sentence naming the two escapes (abonnement / votre clé) lived in a
 * `title=` tooltip — hover-only, and unreadable on a touch screen. These pin that the
 * row's BODY now answers it (the chip and the badge are no longer targets of their own),
 * and reports which route the user bumped into.
 */
const MODEL = { id: "gpt-5.5", provider: "openai", label: "GPT-5.5" } as ModelInfo;

async function render(node: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(node));
  return { el, unmount: async () => { await act(async () => root.unmount()); el.remove(); } };
}

const row = (el: HTMLElement) => el.querySelector<HTMLButtonElement>(".model-option")!;

describe("ModelRow — une ligne inaccessible explique quoi faire", () => {
  it("« Clé requise » : le CORPS annonce la route CLÉ, avec le fournisseur", async () => {
    const calls: Array<[string, string | undefined]> = [];
    let chosen = 0;
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_key",
        onChoose: () => { chosen++; },
        onHover: () => {},
        onAccessInfo: (focus, provider) => calls.push([focus, provider]),
      }),
    );
    const chip = el.querySelector<HTMLElement>(".model-unavailable");
    expect(chip, "la pastille doit être rendue").toBeTruthy();
    expect(chip!.textContent).toContain("Clé requise");
    // The chip is a LABEL now — no role, no second target inside the row.
    expect(chip!.getAttribute("role")).toBeNull();
    await act(async () => row(el).click());
    expect(calls).toEqual([["key", "OpenAI"]]);
    expect(chosen, "le corps explique, il ne sélectionne pas un modèle qui ne peut pas envoyer").toBe(0);
    await unmount();
  });

  afterEach(() => configurePlatformAccess({ served: true }));

  it("par défaut (rien à vendre), la pastille dit « Indisponible » et le corps ouvre la même explication", async () => {
    const calls: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_credits",
        onChoose: () => {},
        onHover: () => {},
        onAccessInfo: (focus) => calls.push(focus),
      }),
    );
    const chip = el.querySelector<HTMLElement>(".model-unavailable")!;
    expect(chip.textContent).toContain("Indisponible");
    expect(chip.textContent).not.toContain("Abonnement");
    await act(async () => row(el).click());
    expect(calls).toEqual(["credits"]);
    await unmount();
  });

  it("« Abonnement requis » annonce la route CRÉDITS — dans un build qui VEND", async () => {
    configurePlatformAccess({ served: true, sold: true });
    const calls: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_credits",
        onChoose: () => {},
        onHover: () => {},
        onAccessInfo: (focus) => calls.push(focus),
      }),
    );
    expect(el.querySelector<HTMLElement>(".model-unavailable")!.textContent).toContain("Abonnement requis");
    await act(async () => row(el).click());
    expect(calls).toEqual(["credits"]);
    await unmount();
  });

  it("sans explicateur câblé, le corps CHOISIT le modèle — jamais un clic mort", async () => {
    const chosen: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_key",
        onChoose: (id) => chosen.push(id),
        onHover: () => {},
      }),
    );
    await act(async () => row(el).click());
    expect(chosen).toEqual(["gpt-5.5"]);
    await unmount();
  });
});

describe("ModelRow — le MODÈLE PAR DÉFAUT se définit depuis le menu contextuel", () => {
  const menuItem = () => document.body.querySelector<HTMLButtonElement>(".model-row-pop .model-row-act");

  it("le « ⋯ » ouvre le menu ; son item DÉFINIT le défaut, sans choisir le modèle", async () => {
    let chosen = 0;
    const set: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: undefined,
        onChoose: () => { chosen++; },
        onHover: () => {},
        isDefault: false,
        onSetDefault: (id) => set.push(id),
      }),
    );
    // No house on an ordinary row any more: the row is body + star (+ the hover ⋯).
    expect(el.querySelector(".model-default")).toBeNull();
    const more = el.querySelector<HTMLElement>(".model-more");
    expect(more, "le ⋯ doit être rendu").toBeTruthy();
    expect(menuItem()).toBeNull();
    await act(async () => more!.click());
    const item = menuItem();
    expect(item, "le menu doit s'ouvrir dans le body").toBeTruthy();
    expect(item!.textContent).toContain("Définir comme modèle par défaut");
    await act(async () => item!.click());
    expect(set).toEqual(["gpt-5.5"]);
    expect(chosen, "définir le défaut ne sélectionne pas le modèle").toBe(0);
    expect(menuItem(), "le menu se referme sur son geste").toBeNull();
    await unmount();
  });

  it("un clic droit sur la ligne ouvre le même menu", async () => {
    const set: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: undefined,
        onChoose: () => {},
        onHover: () => {},
        compact: true,
        isDefault: false,
        onSetDefault: (id) => set.push(id),
      }),
    );
    // Simplified view: body + star only — no ⋯ drawn — yet the right-click still serves.
    expect(el.querySelector(".model-more")).toBeNull();
    await act(async () => {
      row(el).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    });
    const item = menuItem();
    expect(item).toBeTruthy();
    await act(async () => item!.click());
    expect(set).toEqual(["gpt-5.5"]);
    await unmount();
  });

  it("sur le défaut ACTUEL : la maison pleine reste (information), l'item du menu est inerte", async () => {
    const set: string[] = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: undefined,
        onChoose: () => {},
        onHover: () => {},
        isDefault: true,
        onSetDefault: (id) => set.push(id),
      }),
    );
    expect(el.querySelector(".model-default.on")).toBeTruthy();
    await act(async () => el.querySelector<HTMLElement>(".model-more")!.click());
    const item = menuItem()!;
    expect(item.disabled).toBe(true);
    await act(async () => item.click());
    expect(set, "cliquer le défaut ne redéfinit rien").toEqual([]);
    await unmount();
  });

  it("sans `onSetDefault`, ni maison, ni ⋯, ni menu (surfaces sans réglage)", async () => {
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: undefined,
        onChoose: () => {},
        onHover: () => {},
      }),
    );
    expect(el.querySelector(".model-default")).toBeNull();
    expect(el.querySelector(".model-more")).toBeNull();
    await act(async () => {
      row(el).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(menuItem()).toBeNull();
    await unmount();
  });
});
