import type { Message } from "../../types";
import { KeyIcon, InfoIcon, RefreshIcon, ArrowRightIcon } from "../brand";
import { AgentCard, GlyphTile, AgentCardTitle } from "./AgentCard";

import { useT } from "../../i18n";
type ErrorAction = NonNullable<Message["errorAction"]>;

/** The short status label above the message, by CTA kind — except when the TEXT says
 *  « Crédits épuisés »: the key there is a proposed ISSUE, not the requirement (« Clé
 *  requise » above a credits block was lying about the cause). */
function eyebrowFor(action: ErrorAction | undefined, text: string): string {
  // « n'a plus de crédits » = the user's PROVIDER account is dry;
  // « Crédits épuisés » = the subscription budget. In both cases the CTA's
  // key/subscription is a proposed way out, not the cause — the eyebrow must not lie about it.
  if (
    text.startsWith("Crédits épuisés") ||
    text.startsWith("Ce modèle n'est pas disponible") ||
    /n'a plus de crédits/.test(text)
  ) {
    return "Envoi impossible";
  }
  // An exhausted quota carries the SAME action (the subscription) without making it a
  // requirement: it resets on its own at reset time, and « Abonnement requis » above
  // would sell as mandatory what is only a shortcut.
  // ⚠️ Coupled to the TEXT (`state/errors.ts`), which has two forms: « Vos N requêtes
  // gratuites du jour sont épuisées » (free tier) and « Votre quota chez X est
  // épuisé » (paid key). Its test re-reads the REAL message, not a copy.
  if (/requêtes gratuites du jour|quota .* épuisé/i.test(text)) return "Quota épuisé";
  if (action?.kind === "missing_key") return "Clé requise";
  if (action?.kind === "upgrade_plan") return "Abonnement requis";
  return "Envoi impossible";
}

/**
 * A FAILED / blocked turn, shown UNDER the assistant bubble — built on the shared
 * `AgentCard` shell so it reads as one family with the credits / integration / write-
 * confirm cards instead of the bespoke red box it replaces. CORAL (the kit's error tone):
 * a missing provider key, an org/credit block, or a genuinely failed response.
 *
 * The optional CTA (`missing_key` → open the key modal, `upgrade_plan` → open Paiement)
 * delegates to the SHARED `onAction` with the existing `errorAction` kinds — no new
 * plumbing — and « Réessayer » regenerates in place. `credit_options` is NOT handled here
 * (it renders the richer `CreditsCard`). Pure presentation.
 */
export function FailedTurnCard({
  assistantId,
  text,
  action,
  onAction,
  onRetry,
}: {
  assistantId: string;
  /** The persisted failure message (survives reload). */
  text: string;
  /** The CTA to offer, if any. `credit_options` never reaches this card. */
  action?: Exclude<ErrorAction, { kind: "credit_options" }>;
  onAction?: (assistantId: string, action: ErrorAction) => void;
  onRetry?: (assistantId: string) => void;
}) {
  const t = useT();
  // A failure is a STATUS, not a redaction category: it takes the semantic
  // scarlet. (`--hl-coral` wasn't declared anywhere — the stripe and the tile
  // therefore had NO colour at all: `background: var(--undefined)` is invalid.)
  const hue = "var(--red-500)";
  // With a CTA, « Réessayer » is the secondary (ghost) action beside it; alone it IS
  // the action, so it takes the primary style.
  const hasCta = !!action && !!onAction;
  return (
    <AgentCard
      className="failed-turn-card"
      stripe={hue}
      eyebrow={eyebrowFor(action, text)}
      tile={
        <GlyphTile bg="var(--red-soft)" color="var(--red-500)">
          {action?.kind === "missing_key" ? <KeyIcon size={18} /> : <InfoIcon size={18} />}
        </GlyphTile>
      }
      footer={
        <>
          <span className="agent-card-spacer" />
          {onRetry && (
            <button
              className={`${hasCta ? "btn-ghost" : "btn-primary"} btn-inline failed-retry`}
              onClick={() => onRetry(assistantId)}
            >
              <RefreshIcon size={14} /> Réessayer
            </button>
          )}
          {action?.kind === "missing_key" && onAction && (
            <button className="btn-primary btn-inline" onClick={() => onAction(assistantId, action)}>
              <KeyIcon size={14} /> Renseigner la clé
            </button>
          )}
          {action?.kind === "upgrade_plan" && onAction && (
            <button className="btn-primary btn-inline" onClick={() => onAction(assistantId, action)}>
              {t.billing.ctaUpgrade} <ArrowRightIcon size={14} />
            </button>
          )}
        </>
      }
    >
      <AgentCardTitle marked={false}>{text || "La réponse a échoué."}</AgentCardTitle>
    </AgentCard>
  );
}
