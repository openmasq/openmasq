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
 * The unavailable chip is the FIRST place a user meets the paid-model question, and it
 * used to be a dead end: the one sentence naming the two escapes (abonnement / votre clé)
 * lived in a `title=` tooltip — hover-only, and unreadable on a touch screen. These pin
 * that it now ANSWERS itself, and reports which route the user bumped into.
 */
const MODEL = { id: "gpt-5.5", provider: "openai", label: "GPT-5.5" } as ModelInfo;

async function render(node: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(node));
  return { el, unmount: async () => { await act(async () => root.unmount()); el.remove(); } };
}

describe("ModelRow — la pastille d'indisponibilité explique quoi faire", () => {
  it("« Clé requise » est cliquable et annonce la route CLÉ, avec le fournisseur", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_key",
        onChoose: () => {},
        onHover: () => {},
        onAccessInfo: (focus, provider) => calls.push([focus, provider]),
      }),
    );
    const chip = el.querySelector<HTMLElement>(".model-unavailable");
    expect(chip, "la pastille doit être rendue").toBeTruthy();
    expect(chip!.classList.contains("clickable")).toBe(true);
    expect(chip!.textContent).toContain("Clé requise");
    // Elle dit qu'on peut agir — une pastille muette n'apprend rien.
    expect(chip!.textContent).toMatch(/comment faire/i);
    await act(async () => chip!.click());
    expect(calls).toEqual([["key", "OpenAI"]]);
    await unmount();
  });

  afterEach(() => configurePlatformAccess({ served: true }));

  it("par défaut (rien à vendre), la pastille dit « Indisponible » et ouvre la même explication", async () => {
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
    await act(async () => chip.click());
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
    const chip = el.querySelector<HTMLElement>(".model-unavailable")!;
    expect(chip.textContent).toContain("Abonnement requis");
    await act(async () => chip.click());
    expect(calls).toEqual(["credits"]);
    await unmount();
  });

  it("cliquer la pastille NE choisit PAS le modèle (le clic ne remonte pas à la ligne)", async () => {
    let chosen = 0;
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_key",
        onChoose: () => { chosen++; },
        onHover: () => {},
        onAccessInfo: () => {},
      }),
    );
    await act(async () => el.querySelector<HTMLElement>(".model-unavailable")!.click());
    expect(chosen, "la pastille explique, elle ne sélectionne pas").toBe(0);
    await unmount();
  });

  it("sans explicateur câblé, la pastille reste un simple libellé (jamais un bouton mort)", async () => {
    const { el, unmount } = await render(
      React.createElement(ModelRow, {
        model: MODEL,
        selected: false,
        focused: false,
        reason: "no_key",
        onChoose: () => {},
        onHover: () => {},
      }),
    );
    const chip = el.querySelector<HTMLElement>(".model-unavailable")!;
    expect(chip.classList.contains("clickable")).toBe(false);
    expect(chip.getAttribute("role")).toBeNull();
    await unmount();
  });
});

describe("ModelRow — le marqueur MODÈLE PAR DÉFAUT", () => {
  it("sur une ligne ordinaire : cliquer la maison DÉFINIT le défaut, sans choisir le modèle", async () => {
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
    const home = el.querySelector<HTMLElement>(".model-default")!;
    expect(home, "la maison doit être rendue").toBeTruthy();
    expect(home.classList.contains("on")).toBe(false);
    await act(async () => home.click());
    expect(set).toEqual(["gpt-5.5"]);
    expect(chosen, "définir le défaut ne sélectionne pas le modèle").toBe(0);
    await unmount();
  });

  it("sur le défaut ACTUEL : marqueur plein et inerte (informatif, pas une action)", async () => {
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
    const home = el.querySelector<HTMLElement>(".model-default")!;
    expect(home.classList.contains("on")).toBe(true);
    expect(home.getAttribute("aria-disabled")).toBe("true");
    await act(async () => home.click());
    expect(set, "cliquer le défaut ne redéfinit rien").toEqual([]);
    await unmount();
  });

  it("sans `onSetDefault`, aucun marqueur maison (surfaces sans réglage)", async () => {
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
    await unmount();
  });
});
