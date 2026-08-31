import { ModalShell } from "./ModalShell";
import { KeyIcon, ShieldIcon, ZapIcon, ArrowRightIcon } from "../../components/brand";
import { BRAND } from "@openmasq/branding";
import { platformAccessServed, subscriptionsSold } from "../../send/platformAccess";

import { useT } from "../../i18n";
/**
 * THE explanation of how you reach a model: free, on your subscription, or with
 * your own provider key. One modal, because the three are alternatives to each other and
 * a user only understands them side by side.
 *
 * It opens from the « gratuit » badge AND from an unavailable chip (« Clé requise » /
 * « Abonnement requis ») in the pickers. That second entry is the point: the chip used to
 * carry its explanation in a `title=` tooltip — hover-only, unstyleable, and simply
 * unreadable on a touch screen, so the one sentence naming the two escapes reached
 * nobody who needed it.
 *
 * ⚠️ **Never pitch a subscription to someone who already pays.** The caller decides with
 * `state/billing.ts` `canPitchSubscription` (rule 9 — one rule, not a check per surface)
 * and omits `onSubscribe`; the card then STATES the coverage instead. An unknown
 * subscription counts as covered on purpose, so a slow billing fetch can't tell a
 * subscriber to subscribe.
 */
export function ModelAccessModal({
  onClose,
  focus = "free",
  providerLabel,
  onSubscribe,
  onOwnKeys,
}: {
  onClose: () => void;
  /** Which route the user just bumped into — it leads, the others follow. */
  focus?: "free" | "credits" | "key";
  /** The provider whose key would unlock the model they picked (`focus: "key"`). */
  providerLabel?: string;
  /** Open Réglages → Paiement. Absent ⇒ premium is ALREADY covered (a paying plan or an
   *  org seat), or this platform sells nothing — either way, no upsell. */
  onSubscribe?: () => void;
  /** Open Réglages → Modèles (absent = the user is already there). */
  onOwnKeys?: () => void;
}) {
  const t = useT();
  // Ce build a-t-il un service hébergé ? Sans lui, il n'y a NI modèles inclus NI
  // abonnement : la seule route est la clé de l'utilisateur (ou un modèle local, ou sa
  // CLI). Tout ce que cette modale dit d'autre serait faux — `send/platformAccess.ts`.
  const served = platformAccessServed();
  // Et VEND-il quelque chose ? Sinon (le défaut) la route « abonnement » n'existe pas :
  // ni option, ni bouton, ni le mot — les modèles inclus sont ceux du compte.
  const sold = subscriptionsSold();
  const title = !served
    ? "Ce modèle demande votre clé"
    : focus === "key"
      ? "Ce modèle demande votre clé"
      : focus === "credits"
        ? sold
          ? "Ce modèle demande un abonnement"
          : "Ce modèle n'est pas ouvert sur votre compte"
        : "Gratuit, avec des limites";
  const lead = !served
    ? `${providerLabel ?? "Ce fournisseur"} s'utilise avec votre propre clé. Cette version n'a pas de service hébergé : un modèle local ou votre CLI d'abonnement sont les autres chemins.`
    : focus === "key"
      ? `${providerLabel ?? "Ce fournisseur"} s'utilise avec votre propre clé — ou choisissez un autre modèle.`
      : focus === "credits"
        ? sold
          ? `Ce modèle passe par ${BRAND.name}, et votre compte n'a plus de crédits.`
          : `Ce modèle passe par ${BRAND.name}, et il n'est pas disponible sur votre compte pour le moment.`
        : // Ce qu'un modèle « gratuit » coûte VRAIMENT : rien en crédits, mais un débit et
          // une disponibilité qui ne sont pas les nôtres. C'est la surprise à éviter.
          sold
          ? `Un modèle gratuit n'entame pas vos crédits : compte ${BRAND.name} connecté, sans abonnement — mais débit et disponibilité dépendent du fournisseur.`
          : `Un modèle gratuit est inclus avec votre compte ${BRAND.name}, sans clé — mais débit et disponibilité dépendent du fournisseur.`;

  return (
    <ModalShell onClose={onClose} width="min(560px, 94vw)">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.modelAccess.eyebrow}</div>
        <h2 className="cv-display rrm-title">{title}</h2>
        <p className="rrm-sub">{lead}</p>
      </div>
      <div className="fm-options">
        {served && (
          <div className={`fm-option fm-option-static${focus === "free" ? " is-focus" : ""}`}>
            <span className="fm-option-icon">
              <ZapIcon size={18} />
            </span>
            <span className="fm-option-body">
              <span className="fm-option-title">{sold ? t.modals.modelAccess.freeModels : t.modals.modelAccess.includedModels}</span>
              <span className="fm-option-desc">
                {sold
                  ? t.modals.modelAccess.freeDescSold(BRAND.name)
                  : t.modals.modelAccess.freeDescServed(BRAND.name)}
              </span>
            </span>
          </div>
        )}

        {!served || !sold ? null : onSubscribe ? (
          <button
            type="button"
            className={`fm-option${focus === "credits" ? " is-focus" : ""}`}
            onClick={onSubscribe}
          >
            <span className="fm-option-icon">
              <ShieldIcon size={18} />
            </span>
            <span className="fm-option-body">
              <span className="fm-option-title">{t.modals.modelAccess.subscription(BRAND.name)}</span>
              <span className="fm-option-desc">
                {t.modals.modelAccess.subscriptionDesc(BRAND.name)}
              </span>
            </span>
            <ArrowRightIcon size={15} />
          </button>
        ) : (
          <div className="fm-option fm-option-static">
            <span className="fm-option-icon">
              <ShieldIcon size={18} />
            </span>
            <span className="fm-option-body">
              <span className="fm-option-title">{t.modals.modelAccess.subscriptionCovers}</span>
              <span className="fm-option-desc">
                {t.modals.modelAccess.subscriptionCoversDesc}
              </span>
            </span>
          </div>
        )}

        {onOwnKeys ? (
          <button
            type="button"
            className={`fm-option${focus === "key" ? " is-focus" : ""}`}
            onClick={onOwnKeys}
          >
            <span className="fm-option-icon">
              <KeyIcon size={18} />
            </span>
            <span className="fm-option-body">
              <span className="fm-option-title">{t.modals.modelAccess.ownKey}</span>
              <span className="fm-option-desc">
                {t.modals.modelAccess.ownKeyDesc(
                  sold ? t.modals.modelAccess.ownKeyWithoutCredits : "",
                )}
              </span>
            </span>
            <ArrowRightIcon size={15} />
          </button>
        ) : (
          <div className={`fm-option fm-option-static${focus === "key" ? " is-focus" : ""}`}>
            <span className="fm-option-icon">
              <KeyIcon size={18} />
            </span>
            <span className="fm-option-body">
              <span className="fm-option-title">{t.modals.modelAccess.ownKey}</span>
              <span className="fm-option-desc">
                {t.modals.modelAccess.ownKeyStatic}
              </span>
            </span>
          </div>
        )}
      </div>
      {served && (
        <p className="rrm-sub fm-note">
          {t.modals.modelAccess.openRouterNote(BRAND.name)}
        </p>
      )}
      {onSubscribe && (
        <div className="fm-foot">
          <button type="button" className="btn-primary" onClick={onSubscribe}>
            {t.billing.ctaSee}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
