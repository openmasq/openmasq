import { getMessages } from "@openmasq/i18n";
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { FailedTurnCard } from "./FailedTurnCard";
import { mount } from "../../testKit";
import { humanizeSendError } from "../../state/errors";

/** The « Crédits épuisés » card must offer a WAY OUT, not dead text (journal
 *  02/08: a blocked org member only had « Réessayer »). And its eyebrow stays
 *  honest: the key is a PROPOSED way out, not the cause of the block. */
// The banner is decided on the TEXT, so shortening a message elsewhere can silently
// flip it — it happened by shortening the quota one, which began with
// « Le quota gratuit… ». This test reads the REAL message rather than a copied constant.
/* The error classes and their remedies don't depend on the language; the French
   catalogue is the witness, and the patterns expected below are its own. */
const t = getMessages("fr");

describe("FailedTurnCard — un quota épuisé n'est pas un abonnement requis", () => {
  it("garde « Quota épuisé » au-dessus du vrai message de quota", async () => {
    const text = humanizeSendError(
      'openrouter request failed (429): {"error":{"message":"Rate limit exceeded: free-models-per-day",' +
        '"metadata":{"limit_source":"openrouter_free_tier_daily"}}}',
      t,
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
    expect(ui.el.textContent).toContain("Envoi impossible"); // never « Clé requise » here
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
