// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { configurePlatformAccess } from "../../../send/platformAccess";
import { ProviderAccess } from "./ProviderAccess";
import { mount } from "../../../testKit";

/**
 * « D'où viennent vos modèles »: TWO chip groups — keys on one side, already
 * installed agents on the other. What these cases protect:
 *  1. the two paths never get confused — showing « clé Anthropic » to someone
 *     with a Claude Code subscription makes them paste a key they don't need;
 *  2. the subscription is offered only ONCE, at the ACCOUNT level — on an
 *     OpenAI chip it would sell inference the platform doesn't serve;
 *  3. each chip states its real state (open or not);
 *  4. a chip opens the RIGHT provider — getting it wrong is invisible on screen
 *     and is only discovered on the first send.
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

const chip = (ui: Awaited<ReturnType<typeof render>>, name: string) =>
  ui.findAll(".source-chip").find((el) => el.textContent?.includes(name))!;

describe("ProviderAccess — deux voies, des pastilles cliquables", () => {
  afterEach(() => configurePlatformAccess({ served: true }));

  it("une pastille par fournisseur à clé, OpenRouter en tête et conseillé", async () => {
    const ui = await render();
    const names = ui
      .findAll(".source-chip")
      .map((c) => c.querySelector(".source-chip-name")!.textContent);
    expect(names[0]).toBe("OpenRouter");
    for (const p of ["OpenAI", "Anthropic", "Mistral", "DeepSeek"]) expect(names).toContain(p);
    expect(chip(ui, "OpenRouter").querySelector(".source-chip-best")?.textContent).toBe(
      "conseillé",
    );
    await ui.unmount();
  });

  it("sans hôte qui sait sonder une CLI, aucun groupe « agent » — promettre un branchement absent serait mentir", async () => {
    const ui = await render();
    expect(ui.findAll(".source-group")).toHaveLength(1);
    await ui.unmount();
  });

  it("par défaut (rien à vendre), aucune note d'abonnement — même sans abonnement", async () => {
    const ui = await render();
    expect(ui.maybe(".provider-grid-note")).toBeNull();
    for (const c of ui.findAll(".source-chip")) expect(c.textContent).not.toContain("abonnement");
    await ui.unmount();
  });

  it("l'abonnement est proposé UNE fois sous les groupes, jamais sur une pastille — dans un build qui VEND", async () => {
    configurePlatformAccess({ served: true, sold: true });
    const ui = await render();
    expect(ui.findAll(".provider-grid-note")).toHaveLength(1);
    for (const c of ui.findAll(".source-chip")) expect(c.textContent).not.toContain("abonnement");
    // …and it disappears as soon as the account has one.
    const paying = await render({ hasSubscription: true });
    expect(paying.maybe(".provider-grid-note")).toBeNull();
    await paying.unmount();
    await ui.unmount();
  });

  it("une pastille dit son état réel : ouverte (clé ou inclus) ou à ouvrir", async () => {
    const ui = await render({ keyConfigured: new Set(["openai"]), hasSubscription: true });
    expect(chip(ui, "OpenAI").className).toContain("on");
    expect(chip(ui, "OpenAI").getAttribute("title")).toContain("Clé enregistrée");
    // OpenRouter with no key but covered by the subscription (the only double-listed provider).
    expect(chip(ui, "OpenRouter").className).toContain("on");
    expect(chip(ui, "OpenRouter").getAttribute("title")).toContain("Inclus");
    // A BYO with no key stays open-to-add, subscription or not.
    expect(chip(ui, "Mistral").className).not.toContain("on");
    await ui.unmount();
  });

  it("le groupe « agent » ne montre QUE les CLI que l'hôte sait sonder, et dit celle qui manque", async () => {
    const ui = await mount(
      <ProviderAccess
        keyConfigured={new Set<string>()}
        hasSubscription={false}
        onOpenKey={() => {}}
        claudeCliEnabled
        onClaudeCliEnabled={() => {}}
        onAntigravityCliEnabled={() => {}}
        // Codex : le réglage est branché mais l'hôte ne sait pas sonder ⇒ pas de pastille.
        onCodexCliEnabled={() => {}}
      />,
      {
        host: {
          probeClaudeCli: () => Promise.resolve(true),
          probeAntigravityCli: () => Promise.resolve(false),
        },
      },
    );
    const agents = ui.findAll(".source-group")[1];
    const names = [...agents.querySelectorAll(".source-chip-name")].map((n) => n.textContent);
    expect(names).toEqual(["Claude Code", "Antigravity"]);
    // Activé ⇒ la marque le dit ; introuvable ⇒ la pastille s'efface sans disparaître.
    expect(chip(ui, "Claude Code").className).toContain("on");
    expect(chip(ui, "Antigravity").className).toContain("missing");
    await ui.unmount();
  });

  it("cliquer une pastille ouvre la clé du BON fournisseur", async () => {
    const onOpenKey = vi.fn();
    const ui = await render({ onOpenKey });
    (chip(ui, "Anthropic") as HTMLButtonElement).click();
    expect(onOpenKey).toHaveBeenCalledWith("anthropic");
    await ui.unmount();
  });

  it("une organisation qui refuse les clés remplace le groupe par UNE phrase, pas des pastilles inertes", async () => {
    const ui = await render({ byoKeysBlocked: true, organizationName: "Acme" });
    expect(ui.findAll(".source-chip")).toHaveLength(0);
    expect(ui.maybe(".org-managed-note")!.textContent).toContain("Acme");
    await ui.unmount();
  });
});
