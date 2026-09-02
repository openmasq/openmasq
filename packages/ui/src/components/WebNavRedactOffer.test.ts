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
 * The reveal card BEFORE a search: the only place where we decide to let
 * a value leave in clear, and the mechanism that makes a permanent « mode navigation »
 * unnecessary (see `privacy/privacyLevel.ts`). The question is asked every time, on the
 * categories concerned, and nothing leaves without it.
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
   * ⚠️ The card offers a LEVEL, plus types (18/08). What kept the question
   * honest is therefore no longer « rien n'est coché » — there's nothing left to check — but the
   * three properties below: the choice is explicit, it's worth all of the offered or nothing,
   * and the card states its SCOPE (this message only).
   */
  it("propose un NIVEAU : deux boutons, aucune case à cocher", async () => {
    const { el, unmount } = await render(["name", "dob", "address", "location", "company"]);
    expect(el.querySelectorAll(".webnav-offer-chip")).toHaveLength(0);
    expect(el.textContent).toContain("Allégé");
    // The five types are NOT enumerated: that's the whole point of the change.
    expect(el.textContent).not.toContain("Date de naissance");
    await unmount();
  });

  it("« Laisser en clair · ce message » révèle TOUT l'offert — le niveau, pas un sous-ensemble", async () => {
    const offert = ["name", "dob", "address", "location", "company"] as RedactCategoryKey[];
    const { el, decided, unmount } = await render(offert);
    // The shared lexicon (`conversation.mark`): the reversible verb, suffixed with its
    // reach — never « Passer en <niveau> », which named a level rather than a gesture.
    const go = [...el.querySelectorAll<HTMLElement>("button")].find((b) =>
      b.textContent?.includes("Laisser en clair · ce message"),
    );
    await act(async () => go!.click());
    expect(decided).toEqual([offert]);
    await unmount();
  });

  it("« Garder le masquage » ne révèle RIEN", async () => {
    const { el, decided, unmount } = await render(["name", "company"]);
    const keep = [...el.querySelectorAll<HTMLElement>("button")].find((b) =>
      b.textContent?.includes("Garder"),
    );
    await act(async () => keep!.click());
    expect(decided).toEqual([[]]);
    await unmount();
  });

  it("annonce la PORTÉE : ce message seulement", async () => {
    // A generous default is only acceptable if the scope is stated — that's the
    // trade-off of the shift from « conversation entière » → « cet envoi ».
    const { el, unmount } = await render(["name", "company"]);
    const note = el.querySelector(".agent-card-note")?.textContent ?? "";
    expect(note).toContain("Ce message seulement");
    await unmount();
  });
});
