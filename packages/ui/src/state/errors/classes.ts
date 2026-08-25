import type { ProviderId } from "@openmasq/llm";
import { classifyRedactFailure } from "../../send/redactFailure";

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
    // Ce qui ne se coupe PAS : que rien n'est parti. C'est une promesse de confidentialité,
    // pas un détail de formulation — et c'est la première question qu'on se pose ici.
    // ⚠️ Plus de « changez de moteur (Réglages → Confidentialité) » : ce sélecteur
    // n'existe plus pour l'utilisateur (`Settings.redactEngine` est verrouillé sur
    // "local") — conseiller un réglage introuvable est pire que ne rien conseiller.
    // Le `(reason)` reste : ce message est aussi ce que le journal de débogage reçoit,
    // et c'est là que le détail sert.
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
      // QUI peut débloquer change avec le compte : sur un compte perso c'est vous, dans
      // une organisation c'est l'admin. C'est la seule chose que ces deux phrases doivent
      // encore distinguer.
      personal
        ? "Crédits épuisés. Passez à un abonnement supérieur, utilisez votre propre clé, " +
            "ou attendez le renouvellement."
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
