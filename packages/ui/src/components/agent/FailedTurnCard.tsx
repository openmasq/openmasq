import type { Message } from "../../types";
import { KeyIcon, InfoIcon, RefreshIcon, ArrowRightIcon } from "../brand";
import { AgentCard, GlyphTile, AgentCardTitle } from "./AgentCard";
import { BILLING_CTA } from "../../help";

type ErrorAction = NonNullable<Message["errorAction"]>;

/** The short status label above the message, by CTA kind — sauf quand le TEXTE dit
 *  « Crédits épuisés » : la clé y est une ISSUE proposée, pas l'exigence (« Clé
 *  requise » au-dessus d'un blocage crédits mentait sur la cause). */
function eyebrowFor(action: ErrorAction | undefined, text: string): string {
  // « n'a plus de crédits » = le compte FOURNISSEUR de l'utilisateur est à sec ;
  // « Crédits épuisés » = le budget d'abonnement. Dans les deux cas la clé/l'abonnement du
  // CTA est une issue proposée, pas la cause — l'eyebrow ne doit pas mentir dessus.
  if (text.startsWith("Crédits épuisés") || /n'a plus de crédits/.test(text)) {
    return "Envoi impossible";
  }
  // Un quota épuisé porte la MÊME action (l'abonnement) sans en faire une exigence :
  // il repart tout seul à la réinitialisation, et « Abonnement requis » au-dessus
  // vendrait comme obligatoire ce qui n'est qu'un raccourci.
  // ⚠️ Couplé au TEXTE (`state/errors.ts`), qui a deux formes : « Vos N requêtes
  // gratuites du jour sont épuisées » (palier gratuit) et « Votre quota chez X est
  // épuisé » (clé payante). Son test relit le message RÉEL, pas une copie.
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
  // Un échec est un STATUT, pas une catégorie de redaction : il prend l'écarlate
  // sémantique. (`--hl-coral` n'était déclaré nulle part — le liseré et la tuile
  // n'avaient donc AUCUNE couleur : `background: var(--indéfini)` est invalide.)
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
              {BILLING_CTA.upgrade} <ArrowRightIcon size={14} />
            </button>
          )}
        </>
      }
    >
      <AgentCardTitle marked={false}>{text || "La réponse a échoué."}</AgentCardTitle>
    </AgentCard>
  );
}
