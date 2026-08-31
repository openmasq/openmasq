import { PROVIDERS, isPlatformProvider, type ProviderId } from "@openmasq/llm";
import { CheckIcon, ModelLogo, ArrowRightIcon, PlusIcon } from "../../../components/brand";
import { KEYED_PROVIDERS } from "../shared";
import { BRAND } from "@openmasq/branding";
import { subscriptionsSold } from "../../../send/platformAccess";

import { useT } from "../../../i18n";
/**
 * « Vos accès » — the head of Réglages → Modèles, in place of the old per-need model
 * recommendations. Since the five big vendors became personal-key-only, the question a
 * user opens this page with is no longer « lequel je prends ? » but « pourquoi ma liste
 * est-elle si courte ? ». So the head of the page answers THAT.
 *
 * **A grid of small cards, each ONE button.** Every card carries a single gesture — open
 * this provider's key — so there is no nested control to reach for and no wondering which
 * of two buttons does what. The alternative shape (a row per provider with its actions
 * beside it) put three competing calls-to-action on screen for an account that has none
 * of them, which read as a wall of pleading rather than a state.
 *
 * ⚠️ Two things that must stay true:
 * - **The subscription is an ACCOUNT-level offer, not a per-provider one.** It unlocks
 *   Scaleway + the curated OpenRouter set and NOTHING else, so it lives once under the
 *   grid. On the OpenAI card it would sell inference the platform does not serve.
 * - **OpenRouter's OAuth (PKCE) lives in the key modal**, beside the paste field — same
 *   place, both roads to the same key, and the card stays a single gesture.
 *
 * **Compte géré par une organisation** : la grille disparaît au profit d'UNE phrase. Les
 * clés personnelles y sont refusées (l'organisation fournit les modèles et paie les
 * appels ; une clé personnelle serait une sortie que sa politique ne voit pas), et main
 * refuse l'écriture de toute façon. Afficher des cartes inertes ferait chercher pourquoi
 * le clic ne fait rien — on dit l'état, une fois, à l'endroit où on venait agir.
 */
export function ProviderAccess({
  keyConfigured,
  hasSubscription,
  onOpenKey,
  onOpenBilling,
  byoKeysBlocked = false,
  organizationName,
}: {
  keyConfigured?: ReadonlySet<string>;
  /** L'organisation interdit les clés personnelles — la grille cède la place à l'état. */
  byoKeysBlocked?: boolean;
  /** Nommée quand on la connaît : « votre organisation » est vague, « Acme » est un fait. */
  organizationName?: string;
  /** The account draws on platform credits (subscription or org) — so the platform
   *  providers are already usable without a personal key. */
  hasSubscription: boolean;
  onOpenKey: (p: ProviderId) => void;
  onOpenBilling?: () => void;
}) {
  const t = useT();
  /** OpenRouter leads: the only provider reachable BOTH ways. */
  const order: ProviderId[] = ["openrouter", ...KEYED_PROVIDERS.filter((p) => p !== "openrouter")];
  if (byoKeysBlocked) {
    return (
      <p className="provider-grid-note org-managed-note">
        <strong>{organizationName ?? "Votre organisation"} fournit les modèles.</strong>{" "}
        Les clés d&apos;API personnelles sont désactivées sur ce compte : les modèles que votre
        organisation a ouverts fonctionnent sans rien renseigner, et aucun autre ne peut être
        utilisé, même avec une clé à vous. Votre administrateur choisit la liste.
      </p>
    );
  }
  return (
    <>
      <div className="provider-grid">
        {order.map((pid) => {
          const hasKey = !!keyConfigured?.has(pid);
          // Couvert SANS clé : seul un fournisseur plateforme peut l'être, et seulement
          // si le compte a de quoi le payer.
          const covered = !hasKey && isPlatformProvider(pid) && hasSubscription;
          const ready = hasKey || covered;
          return (
            <button
              key={pid}
              type="button"
              className={`provider-card${ready ? " on" : ""}`}
              onClick={() => onOpenKey(pid)}
              title={
                hasKey
                  ? `Modifier la clé ${PROVIDERS[pid].label}`
                  : `Renseigner une clé ${PROVIDERS[pid].label}`
              }
            >
              <ModelLogo provider={pid} size={22} />
              <span className="provider-card-name">{PROVIDERS[pid].label}</span>
              {/* L'ÉTAT reste discret (clé, inclus) ; l'ACTION porte une pastille bouton —
                  en texte gris 11px, « Ajouter une clé » se lisait comme une étiquette,
                  pas comme le geste de la carte (remonté le 14/08). */}
              {ready ? (
                <span className="provider-card-state">
                  <CheckIcon size={12} />
                  {hasKey ? t.modelPicker.keySaved : t.modelPicker.included}
                </span>
              ) : (
                <span className="provider-card-state add">
                  <PlusIcon size={12} />
                  {t.modelPicker.addKey}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* L'abonnement, UNE fois : c'est un fait de compte, pas de fournisseur — et
          seulement dans un build qui VEND (`subscriptionsSold`, éteint par défaut). */}
      {subscriptionsSold() && !hasSubscription && onOpenBilling && (
        <p className="provider-grid-note">
          Sans clé, l&apos;abonnement {BRAND.name} ouvre les modèles inclus.{" "}
          <button type="button" className="lnk" onClick={onOpenBilling}>
            {t.billing.ctaUpgrade} <ArrowRightIcon size={12} />
          </button>
        </p>
      )}
    </>
  );
}
