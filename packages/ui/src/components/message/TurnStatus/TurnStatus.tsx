import type { CreditBalance } from "../../../host";
import type { Message } from "../../../types";
import { CreditsCard } from "../../agent/CreditsCard";
import { FailedTurnCard } from "../../agent/FailedTurnCard";
import { turnStatusOf } from "./status";

type ErrorAction = NonNullable<Message["errorAction"]>;

/**
 * The ONE slot under a reply for the turn's outcome — `turnStatusOf` decides the reason,
 * this renders it: the credits card, or `FailedTurnCard` in the variant that names it.
 * The single « Réessayer » lives on that card (three bespoke retry buttons used to).
 */
export function TurnStatus({
  message,
  onRegenerate,
  onErrorAction,
  credits,
  creditsResetIso,
}: {
  message: Message;
  onRegenerate?: (assistantId: string) => void;
  onErrorAction?: (assistantId: string, action: ErrorAction) => void;
  credits?: CreditBalance | null;
  creditsResetIso?: string;
}) {
  const status = turnStatusOf(message);
  if (!status) return null;
  if (status.kind === "credits") {
    // The two CTAs delegate to the SHARED `onErrorAction`; nowhere to send them ⇒ no card.
    if (!onErrorAction || message.errorAction?.kind !== "credit_options") return null;
    return (
      <CreditsCard
        assistantId={message.id}
        provider={message.errorAction.provider}
        label={message.errorAction.label}
        credits={credits}
        resetIso={creditsResetIso}
        onAction={onErrorAction}
      />
    );
  }
  const action = message.errorAction?.kind === "credit_options" ? undefined : message.errorAction;
  return (
    <FailedTurnCard
      assistantId={message.id}
      reason={status.reason}
      text={status.reason === "error" ? message.errorText || "" : undefined}
      action={status.reason === "error" ? action : undefined}
      onAction={onErrorAction}
      onRetry={onRegenerate}
    />
  );
}
