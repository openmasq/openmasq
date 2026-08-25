// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { WebNavRedactOffer } from "./WebNavRedactOffer";
import type { RedactCategoryKey } from "../types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const act: (cb: () => Promise<void> | void) => Promise<void> = (
  React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }
).act;

/**
 * La carte de révélation AVANT une recherche : le seul endroit où l'on décide de laisser
 * partir une valeur en clair, et le mécanisme qui rend inutile un « mode navigation »
 * permanent (voir `privacy/privacyLevel.ts`). La question est posée à chaque fois, sur les
 * catégories concernées, et rien ne part sans elle.
 */
async function render(categories: RedactCategoryKey[]) {
  const decided: RedactCategoryKey[][] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () =>
    root.render(
      React.createElement(WebNavRedactOffer, { categories, onDecide: (r) => decided.push(r) }),
    ),
  );
  return {
    el,
    decided,
    unmount: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
  };
}

describe("WebNavRedactOffer — la décision se prend ici, à chaque recherche", () => {
  it("s'affiche dès qu'une catégorie est concernée", async () => {
    const { el, unmount } = await render(["name", "email"]);
    expect(el.querySelector(".webnav-offer")).not.toBeNull();
    await unmount();
  });

  it("sans catégorie, aucune carte — on n'interroge pas pour rien", async () => {
    const { el, unmount } = await render([]);
    expect(el.querySelector(".webnav-offer")).toBeNull();
    await unmount();
  });

  /**
   * ⚠️ La carte propose un NIVEAU, plus des types (18/08). Ce qui tenait la question
   * honnête n'est donc plus « rien n'est coché » — il n'y a plus rien à cocher — mais les
   * trois propriétés ci-dessous : le choix est explicite, il vaut tout l'offert ou rien,
   * et la carte dit sa PORTÉE (ce message seulement).
   */
  it("propose un NIVEAU : deux boutons, aucune case à cocher", async () => {
    const { el, unmount } = await render(["name", "dob", "address", "location", "company"]);
    expect(el.querySelectorAll(".webnav-offer-chip")).toHaveLength(0);
    expect(el.textContent).toContain("Standard");
    // Les cinq types ne sont PAS énumérés : c'est tout l'objet du changement.
    expect(el.textContent).not.toContain("Date de naissance");
    await unmount();
  });

  it("« Passer en Standard » révèle TOUT l'offert — le niveau, pas un sous-ensemble", async () => {
    const offert = ["name", "dob", "address", "location", "company"] as RedactCategoryKey[];
    const { el, decided, unmount } = await render(offert);
    const go = [...el.querySelectorAll<HTMLElement>("button")].find((b) =>
      b.textContent?.includes("Standard"),
    );
    await act(async () => go!.click());
    expect(decided).toEqual([offert]);
    await unmount();
  });

  it("« Garder le redaction » ne révèle RIEN", async () => {
    const { el, decided, unmount } = await render(["name", "company"]);
    const keep = [...el.querySelectorAll<HTMLElement>("button")].find((b) =>
      b.textContent?.includes("Garder"),
    );
    await act(async () => keep!.click());
    expect(decided).toEqual([[]]);
    await unmount();
  });

  it("annonce la PORTÉE : ce message seulement", async () => {
    // Un défaut généreux n'est acceptable que si la portée est dite — c'est la
    // contrepartie du passage « conversation entière » → « cet envoi ».
    const { el, unmount } = await render(["name", "company"]);
    const note = el.querySelector(".agent-card-note")?.textContent ?? "";
    expect(note).toContain("Ce message seulement");
    await unmount();
  });
});
