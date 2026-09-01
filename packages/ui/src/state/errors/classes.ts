import type { ProviderId } from "@openmasq/llm";
import { classifyRedactFailure } from "../../send/redactFailure";
import { subscriptionsSold } from "../../send/platformAccess";

/**
 * Thrown by the send pipeline when the chosen model's provider has no API key
 * configured. Carries the `provider` id + human label so the UI can offer an
 * inline "enter your key" modal (instead of only pointing at Settings).
 */
export class MissingApiKeyError extends Error {
  constructor(
    public provider: ProviderId,
    public providerLabel: string,
  ) {
    super(`Missing API key for ${providerLabel}. Add it in Settings.`);
    this.name = "MissingApiKeyError";
  }
}

/**
 * Thrown by the send pipeline when the chosen "remote"/model redaction engine
 * could NOT run (no URL/token, endpoint unreachable, or the server model pass
 * failed). FAIL-CLOSED: the send is aborted so free-form PII the model would have
 * caught is never leaked by a silent downgrade to regex. Retryable once fixed.
 */
export class RedactionUnavailableError extends Error {
  constructor(public reason: string) {
    super(RedactionUnavailableError.buildMessage(reason));
    this.name = "RedactionUnavailableError";
  }

  // Phrase the block by CAUSE, and make crystal-clear it's the redaction
  // (privacy) step — NOT the chat model — so "serveur de redaction down" reads as
  // exactly that, not "the model is broken".
  private static buildMessage(reason: string): string {
    const kind = classifyRedactFailure(reason);
    const cause =
      kind === "network"
        ? "le redaction est injoignable"
        : kind === "auth"
          ? "le redaction a un souci de notre côté"
          : "le redaction n'a pas pu s'exécuter";
    // What does NOT get cut: that nothing went out. That's a privacy promise,
    // not a wording detail — and it's the first question one asks here.
    // ⚠️ No more « changez de moteur (Réglages → Confidentialité) » : that selector
    // no longer exists for the user (`Settings.redactEngine` is locked on
    // "local") — recommending a setting that can't be found is worse than recommending nothing.
    // The `(reason)` stays: this message is also what the debug journal receives,
    // and that's where the detail is useful.
    return `Envoi bloqué : ${cause}, rien n'est parti. Réessayez. (${reason})`;
  }
}

/**
 * Thrown by the send pipeline when the chosen model is not in the organisation's
 * ALLOW-list (`allowedModelIds`). The picker already shows it disabled, but a
 * conversation pinned to a model the org has since closed — or never opened — must
 * not send: FAIL-CLOSED with an actionable message. Carries id + display name.
 */
export class ModelBlockedByOrgError extends Error {
  constructor(
    public modelId: string,
    public modelLabel: string,
  ) {
    super(
      `Le modèle « ${modelLabel} » est désactivé par votre organisation. Choisissez-en un autre.`,
    );
    this.name = "ModelBlockedByOrgError";
  }
}

/**
 * Thrown by the send pipeline when the org's prepaid credit budget for
 * platform-provided answer models is exhausted. FAIL-CLOSED: platform-provided
 * sends are blocked until the budget resets or the org upgrades. Using your OWN
 * API key (BYO) is never blocked — that path bypasses platform credits.
 */
export class CreditsExhaustedError extends Error {
  /** `personal` = an individual (non-org) account → phrase it as THEIR budget with an
   *  upgrade path; otherwise the org-budget wording (admin-managed). */
  constructor(personal = false) {
    super(
      // WHO can unlock changes with the account: on a personal account it's you, in
      // an organization it's the admin. That's the only thing these two phrasings still
      // need to distinguish.
      // And on a personal account of a build that doesn't SELL anything (`subscriptionsSold`,
      // the default), « abonnement supérieur » and « crédits » don't exist: the model isn't
      // open on this account, the key is the way out.
      personal
        ? subscriptionsSold()
          ? "Crédits épuisés. Passez à un abonnement supérieur, utilisez votre propre clé, " +
            "ou attendez le renouvellement."
          : "Ce modèle n'est pas disponible sur votre compte pour le moment. Utilisez votre " +
            "propre clé, ou choisissez un autre modèle."
        : "Crédits épuisés : le budget de votre organisation est atteint. Utilisez votre " +
            "propre clé, ou attendez le renouvellement.",
    );
    this.name = "CreditsExhaustedError";
  }
}

/**
 * Thrown (renderer-side) when a provider replies 429 / rate-limited, so the UI
 * can show a friendly "slow down" banner instead of a raw error dump.
 */
export class RateLimitError extends Error {
  constructor(public providerLabel?: string) {
    super("Rate limited");
    this.name = "RateLimitError";
  }
}
