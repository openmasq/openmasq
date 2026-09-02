import type { Messages } from "@openmasq/i18n";
import type { Message } from "../../types";
import { KeyIcon, InfoIcon, RefreshIcon, ArrowRightIcon } from "../brand";
import { AgentCard, GlyphTile, AgentCardTitle } from "./AgentCard";
import { useT } from "../../i18n";

type ErrorAction = NonNullable<Message["errorAction"]>;
/** Why the turn ended short — `message/TurnStatus/status.ts` decides which. */
export type FailedTurnReason = "error" | "interrupted" | "empty" | "tool";

/** The short status label above the message. For a FAILED turn it reads the CTA kind —
 *  except when the TEXT says « Crédits épuisés »: the key there is a proposed ISSUE, not
 *  the requirement (« Clé requise » above a credits block was lying about the cause). */
function eyebrowFor(
  t: Messages,
  reason: FailedTurnReason,
  action: ErrorAction | undefined,
  text: string,
): string {
  if (reason !== "error") return t.turnStatus.eyebrow[reason];
  // « n'a plus de crédits » = the user's PROVIDER account is dry;
  // « Crédits épuisés » = the subscription budget. In both cases the CTA's
  // key/subscription is a proposed way out, not the cause — the eyebrow must not lie about it.
  if (
    text.startsWith("Crédits épuisés") ||
    text.startsWith("Ce modèle n'est pas disponible") ||
    /n'a plus de crédits|no credits left|out of credits/i.test(text)
  ) {
    return t.turnStatus.eyebrow.sendBlocked;
  }
  // An exhausted quota carries the SAME action (the subscription) without making it a
  // requirement: it resets on its own at reset time, and « Abonnement requis » above
  // would sell as mandatory what is only a shortcut.
  // ⚠️ Coupled to the TEXT (`state/errors.ts` + `@openmasq/i18n` `errors`), which has two
  // forms: « Vos N requêtes gratuites du jour sont épuisées » (free tier) and « Votre
  // quota chez X est épuisé » (paid key). Its test re-reads the REAL message, not a copy.
  if (/requêtes gratuites du jour|quota .* épuisé|quota .* used up|free requests/i.test(text))
    return t.turnStatus.eyebrow.quota;
  if (action?.kind === "missing_key") return t.turnStatus.eyebrow.keyRequired;
  if (action?.kind === "upgrade_plan") return t.turnStatus.eyebrow.planRequired;
  return t.turnStatus.eyebrow.sendBlocked;
}

/**
 * THE turn-status card, shown UNDER the assistant bubble — one component, one class
 * (`.turn-status`), a variant per reason. Built on the shared `AgentCard` shell so it
 * reads as one family with the credits / integration / write-confirm cards.
 *
 *  - `error` — a FAILED / blocked turn: a missing provider key, an org/credit block, or a
 *    genuinely failed response. Scarlet (the semantic status tone, never an `--hl-*`).
 *    The optional CTA (`missing_key` → the key modal, `upgrade_plan` → Paiement)
 *    delegates to the SHARED `onAction` with the existing `errorAction` kinds — no new
 *    plumbing. `credit_options` never reaches this card (`CreditsCard`).
 *  - `interrupted` / `empty` / `tool` — not errors (no red): the stream was cut, nothing
 *    came back, or a tool step failed under a settled turn. Neutral stripe.
 *
 * ONE « Réessayer », whatever the reason — it regenerates in place. Pure presentation.
 */
export function FailedTurnCard({
  assistantId,
  reason = "error",
  text = "",
  action,
  onAction,
  onRetry,
}: {
  assistantId: string;
  reason?: FailedTurnReason;
  /** The persisted failure message (survives reload) — `error` only. */
  text?: string;
  /** The CTA to offer, if any. `credit_options` never reaches this card. */
  action?: Exclude<ErrorAction, { kind: "credit_options" }>;
  onAction?: (assistantId: string, action: ErrorAction) => void;
  onRetry?: (assistantId: string) => void;
}) {
  const t = useT();
  const failed = reason === "error";
  // A failure is a STATUS, not a redaction category: it takes the semantic scarlet.
  // (`--hl-coral` wasn't declared anywhere — the stripe and the tile therefore had NO
  // colour at all: `background: var(--undefined)` is invalid.) The other reasons stay on
  // the shell's neutral stripe: « incomplete » is not « wrong ».
  const stripe = failed ? "var(--red-500)" : undefined;
  // With a CTA, « Réessayer » is the secondary (ghost) action beside it; alone it IS
  // the action, so it takes the primary style.
  const hasCta = failed && !!action && !!onAction;
  const title =
    reason === "interrupted"
      ? t.turnStatus.interrupted
      : reason === "empty"
        ? t.turnStatus.empty
        : reason === "tool"
          ? t.turnStatus.toolFlowFailed
          : text || t.turnStatus.failedDefault;
  return (
    <AgentCard
      className={`turn-status turn-status--${reason}`}
      stripe={stripe}
      eyebrow={eyebrowFor(t, reason, action, text)}
      tile={
        failed ? (
          <GlyphTile bg="var(--red-soft)" color="var(--red-500)">
            {action?.kind === "missing_key" ? <KeyIcon size={18} /> : <InfoIcon size={18} />}
          </GlyphTile>
        ) : (
          <GlyphTile>
            <InfoIcon size={18} />
          </GlyphTile>
        )
      }
      footer={
        <>
          <span className="agent-card-spacer" />
          {onRetry && (
            <button
              className={`${hasCta ? "btn-ghost" : "btn-primary"} btn-inline failed-retry`}
              onClick={() => onRetry(assistantId)}
            >
              <RefreshIcon size={14} /> {t.turnStatus.retry}
            </button>
          )}
          {failed && action?.kind === "missing_key" && onAction && (
            <button className="btn-primary btn-inline" onClick={() => onAction(assistantId, action)}>
              <KeyIcon size={14} /> {t.turnStatus.fillKey}
            </button>
          )}
          {failed && action?.kind === "upgrade_plan" && onAction && (
            <button className="btn-primary btn-inline" onClick={() => onAction(assistantId, action)}>
              {t.billing.ctaUpgrade} <ArrowRightIcon size={14} />
            </button>
          )}
        </>
      }
    >
      <AgentCardTitle marked={false}>{title}</AgentCardTitle>
    </AgentCard>
  );
}
