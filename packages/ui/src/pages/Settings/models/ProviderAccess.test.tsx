// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { configurePlatformAccess } from "../../../send/platformAccess";
import { ProviderAccess } from "./ProviderAccess";
import { mount } from "../../../testKit";

/**
 * « Vos accès » : une grille de petites cartes, une par fournisseur, chacune UN seul
 * geste (ouvrir sa clé). Ce que ces cas protègent :
 *  1. l'abonnement n'est proposé qu'UNE fois, au niveau du COMPTE — sur une carte
 *     OpenAI il vendrait de l'inférence que la plateforme ne sert pas ;
 *  2. chaque carte dit son état réel (clé / inclus / rien) ;
 *  3. une carte ouvre la clé du BON fournisseur — se tromper est invisible à l'écran
 *     et ne se découvre qu'au premier envoi.
 */
const render = (over: Partial<Parameters<typeof ProviderAccess>[0]> = {}) =>
  mount(
    <ProviderAccess
      keyConfigured={new Set<string>()}
      hasSubscription={false}
      onOpenKey={() => {}}
      onOpenBilling={() => {}}
      {...over}
    />,
  );

const card = (ui: Awaited<ReturnType<typeof render>>, name: string) =>
  ui.findAll(".provider-card").find((el) => el.textContent?.includes(name))!;

describe("ProviderAccess — des cartes cliquables, une par fournisseur", () => {
  it("une carte par fournisseur à clé, OpenRouter en tête", async () => {
    const ui = await render();
    const names = ui.findAll(".provider-card").map((c) => c.querySelector(".provider-card-name")!.textContent);
    expect(names[0]).toBe("OpenRouter");
    for (const p of ["OpenAI", "Anthropic", "Mistral", "DeepSeek"]) expect(names).toContain(p);
    await ui.unmount();
  });

  afterEach(() => configurePlatformAccess({ served: true }));

  it("par défaut (rien à vendre), aucune note d'abonnement sous la grille — même sans abonnement", async () => {
    const ui = await render();
    expect(ui.maybe(".provider-grid-note")).toBeNull();
    for (const c of ui.findAll(".provider-card")) expect(c.textContent).not.toContain("abonnement");
    await ui.unmount();
  });

  it("l'abonnement est proposé UNE fois sous la grille, jamais sur une carte — dans un build qui VEND", async () => {
    configurePlatformAccess({ served: true, sold: true });
    const ui = await render();
    expect(ui.findAll(".provider-grid-note")).toHaveLength(1);
    for (const c of ui.findAll(".provider-card")) expect(c.textContent).not.toContain("abonnement");
    // …et il disparaît dès que le compte en a un.
    const paying = await render({ hasSubscription: true });
    expect(paying.maybe(".provider-grid-note")).toBeNull();
    await paying.unmount();
    await ui.unmount();
  });

  it("chaque carte dit son état réel : clé enregistrée, inclus, ou à ajouter", async () => {
    const ui = await render({ keyConfigured: new Set(["openai"]), hasSubscription: true });
    expect(card(ui, "OpenAI").textContent).toContain("Clé enregistrée");
    // OpenRouter sans clé mais couvert par l'abonnement (seul fournisseur double).
    expect(card(ui, "OpenRouter").textContent).toContain("Inclus");
    // Un BYO sans clé reste à ouvrir, abonnement ou pas.
    expect(card(ui, "Mistral").textContent).toContain("Ajouter une clé");
    await ui.unmount();
  });

  it("cliquer une carte ouvre la clé du BON fournisseur", async () => {
    const onOpenKey = vi.fn();
    const ui = await render({ onOpenKey });
    (card(ui, "Anthropic") as HTMLButtonElement).click();
    expect(onOpenKey).toHaveBeenCalledWith("anthropic");
    await ui.unmount();
  });
});
