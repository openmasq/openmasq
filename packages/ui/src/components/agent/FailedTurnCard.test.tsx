// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { FailedTurnCard } from "./FailedTurnCard";
import { mount } from "../../testKit";
import { humanizeSendError } from "../../state/errors";

/** La carte « Crédits épuisés » doit offrir une ISSUE, pas un texte mort (journal
 *  02/08 : un membre d'org bloqué n'avait que « Réessayer »). Et son eyebrow reste
 *  honnête : la clé est une issue PROPOSÉE, pas la cause du blocage. */
// Le bandeau se décide sur le TEXTE, donc raccourcir un message ailleurs peut le faire
// basculer en silence — c'est arrivé en raccourcissant celui du quota, qui commençait par
// « Le quota gratuit… ». Ce test relit le message RÉEL plutôt qu'une constante recopiée.
describe("FailedTurnCard — un quota épuisé n'est pas un abonnement requis", () => {
  it("garde « Quota épuisé » au-dessus du vrai message de quota", async () => {
    const text = humanizeSendError(
      'openrouter request failed (429): {"error":{"message":"Rate limit exceeded: free-models-per-day",' +
        '"metadata":{"limit_source":"openrouter_free_tier_daily"}}}',
    )!;
    const ui = await mount(
      <FailedTurnCard
        assistantId="a1"
        text={text}
        action={{ kind: "upgrade_plan" }}
        onAction={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(ui.el.textContent).toContain("Quota épuisé");
    expect(ui.el.textContent).not.toContain("Abonnement requis");
    await ui.unmount();
  });
});

describe("FailedTurnCard — le blocage crédits offre le geste clé", () => {
  const CREDITS_TEXT =
    "Crédits épuisés : le budget de votre organisation pour les modèles fournis par la plateforme est atteint.";

  it("« Crédits épuisés » + CTA clé : eyebrow « Envoi impossible », bouton actif", async () => {
    const onAction = vi.fn();
    const ui = await mount(
      <FailedTurnCard
        assistantId="a1"
        text={CREDITS_TEXT}
        action={{ kind: "missing_key", provider: "openrouter", label: "OpenRouter" }}
        onAction={onAction}
        onRetry={() => {}}
      />,
    );
    expect(ui.el.textContent).toContain("Envoi impossible"); // jamais « Clé requise » ici
    expect(ui.el.textContent).not.toContain("Clé requise");
    await ui.click(".btn-primary");
    expect(onAction).toHaveBeenCalledWith("a1", expect.objectContaining({ kind: "missing_key" }));
    await ui.unmount();
  });

  it("une vraie clé MANQUANTE garde son eyebrow « Clé requise »", async () => {
    const ui = await mount(
      <FailedTurnCard
        assistantId="a1"
        text="Clé manquante pour OpenRouter. Renseignez-la pour envoyer."
        action={{ kind: "missing_key", provider: "openrouter" }}
        onAction={() => {}}
      />,
    );
    expect(ui.el.textContent).toContain("Clé requise");
    await ui.unmount();
  });
});
