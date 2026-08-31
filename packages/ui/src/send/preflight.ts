import { DEFAULT_LOCALE, getMessages } from "@openmasq/i18n";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { ModelBlockedByOrgError, CreditsExhaustedError } from "../state/errors";
import { modelUnavailableReason } from "./modelAvailability";
import { includedWith, platformAccessServed, subscriptionsSold } from "./platformAccess";
import type { OrgProfileInfo, CreditBalance, BillingSubscription } from "../host";
import type { Message } from "../types";
import { BRAND } from "@openmasq/branding";

/** The outcome of the send PRE-FLIGHT gate: `null` = proceed, else the inline
 *  failure to render on the assistant bubble (text + optional CTA action). Pure so
 *  the security-relevant gate (org suspension, org-blocked model, exhausted credits,
 *  missing key) is unit-testable in isolation from the send closure. */
export interface PreflightFailure {
  text: string;
  action?: Message["errorAction"];
}

export interface PreflightInput {
  orgProfile: OrgProfileInfo | null;
  personalCredits: CreditBalance | null;
  personalSub: BillingSubscription | null;
  /** Providers whose key is configured (a plain string set in the store). */
  keyConfigured: ReadonlySet<string>;
  /** Whether the Host exposes a billing surface (individual credit actions need it). */
  hasBilling: boolean;
  provider: ProviderId;
  model: { id: string; label: string };
  /** Already-computed routing decision: does this send go through the app's metered
   *  gateway/credits (platform provider AND — subscription mode OR no personal key)? */
  effectivePlatform: boolean;
  /** `Settings.openaiCompatBaseUrl` — the self-hosted endpoint (blank = unset). */
  openaiCompatBaseUrl: string;
  /** Last reachability probe of the local endpoint (`false` = didn't answer). Passed
   *  through so the gate and the picker agree (rule 9): both block a local model whose
   *  server is confirmed unreachable. Unknown (null/absent) never blocks. */
  localEndpointReachable?: boolean | null;
  /** Le fournisseur `claude-cli` est-il prêt (réglage activé + CLI détectée) ? Passé
   *  tel quel à `modelUnavailableReason` — seul `true` ouvre (fail-closed). */
  claudeCliReady?: boolean | null;
  /** Idem pour `codex-cli`. */
  codexCliReady?: boolean | null;
}

/**
 * The send pre-flight gate — FAIL CLOSED. Mirrors the checks that used to live inline
 * in `sendMessage`: a suspended org member, an org-blocked model, an exhausted prepaid
 * credit budget (org or personal), a missing provider key and an unconfigured
 * self-hosted endpoint are each blocked here BEFORE any wire leaves. Returns the
 * inline failure to show, or `null` to proceed.
 *
 * The org-governance layer (suspension / blocked model) lives HERE; the "can this model
 * send at all" decision is delegated to `modelUnavailableReason`, the SAME helper the
 * pickers grey out with — so a greyed model and a refused send always agree (rule 9).
 * This function owns only the MESSAGE + CTA for each reason.
 */
export function preflightError(p: PreflightInput): PreflightFailure | null {
  // Org governance. A suspended member can't send (the backend already 403s their
  // org calls; fail closed here too). And a member cannot send with a model their org
  // disabled — the picker hides it, but a conversation pinned to a now-blocked model
  // must FAIL CLOSED (shown inline so the reason sticks).
  if (p.orgProfile?.status === "suspended") {
    return { text: "Votre accès a été suspendu par votre organisation — l'envoi est bloqué." };
  }
  // ALLOW-list : le modèle doit figurer dans ce que l'organisation a ouvert. Un modèle
  // absent de la liste est refusé — y compris un modèle arrivé au catalogue après
  // l'écriture de la politique, que l'ancienne liste de refus laissait passer.
  if (p.orgProfile && !(p.orgProfile.allowedModelIds ?? []).includes(p.model.id)) {
    return { text: new ModelBlockedByOrgError(p.model.id, p.model.label).message };
  }
  // Is the model usable at all? Same decision the pickers grey out with.
  const reason = modelUnavailableReason({
    // `PreflightInput` carries the provider ALONGSIDE the model (whose shape is
    // `{id,label}`), so it has to be recombined here.
    model: { id: p.model.id, provider: p.provider },
    effectivePlatform: p.effectivePlatform,
    orgProfile: p.orgProfile,
    personalCredits: p.personalCredits,
    personalSub: p.personalSub,
    keyConfigured: p.keyConfigured,
    openaiCompatBaseUrl: p.openaiCompatBaseUrl,
    localEndpointReachable: p.localEndpointReachable,
    claudeCliReady: p.claudeCliReady,
    codexCliReady: p.codexCliReady,
  });

  // L'ACCÈS GRATUIT ne sert que deux modèles (`FREE_MODE_MODEL_IDS`) : celui-ci n'en est
  // pas, et il n'y a NI abonnement NI clé. On le dit tel quel — « crédits épuisés » serait
  // faux (aucun crédit n'a jamais existé) sur un modèle que le catalogue affiche
  // « gratuit ». Les deux issues sont les mêmes que pour un budget épuisé, d'où la même
  // carte d'actions : prendre un abonnement, ou renseigner sa propre clé.
  if (reason === "free_mode_only") {
    return {
      // Sans rien à vendre (`subscriptionsSold`, le défaut), la seule issue est la clé.
      text: subscriptionsSold()
        ? `L'accès gratuit de ${BRAND.name} sert Laguna et Nemotron. Pour ce modèle, prenez un ` +
          "abonnement, ou renseignez votre propre clé."
        : `Votre compte ${BRAND.name} inclut Laguna et Nemotron. Pour ce modèle, renseignez votre propre clé.`,
      action: p.hasBilling
        ? { kind: "credit_options", provider: p.provider, label: PROVIDERS[p.provider].label }
        : { kind: "missing_key", provider: p.provider, label: PROVIDERS[p.provider].label },
    };
  }

  // Credits: platform-provided answer models draw on the prepaid budget — the org's for
  // a member, else the user's personal budget. BYO-own-key + redaction never consume
  // platform credits, and a FREE model is never blocked (see `modelUnavailableReason`).
  if (reason === "no_credits") {
    // An INDIVIDUAL (non-org) user can act on this; an org member's budget is
    // admin-managed → text only. For the individual: a FREE account has no platform
    // budget at all (subscription-only) → the two action cards (take a subscription /
    // use your own key); a PAYING account has simply used up its allotment → a neutral
    // "indisponible" (no upsell). Null (subscription unknown) ⇒ treated as free.
    if (!p.orgProfile && p.hasBilling) {
      const paying = (p.personalSub?.tier ?? "free") !== "free";
      if (paying) {
        return { text: "Ce modèle est indisponible pour le moment. Réessayez plus tard." };
      }
      return {
        text: new CreditsExhaustedError(true).message,
        action: { kind: "credit_options", provider: p.provider, label: PROVIDERS[p.provider].label },
      };
    }
    const personalCreditsBlocked = !p.orgProfile && (p.personalCredits?.blocked ?? false);
    // Membre d'org (budget géré par l'admin) ou compte sans facturation : la moitié
    // ACTIONNABLE du message — « utilisez votre propre clé » — devient un bouton au
    // lieu d'un texte mort (journal 02/08 : carte sans issue). `missing_key` ouvre la
    // modale de clé du provider puis régénère en place, plomberie existante ; l'option
    // abonnement reste du ressort de l'admin, donc pas de carte d'upsell ici.
    return {
      text: new CreditsExhaustedError(personalCreditsBlocked).message,
      action: { kind: "missing_key", provider: p.provider, label: PROVIDERS[p.provider].label },
    };
  }

  if (reason === "no_key") {
    // Keys live encrypted in main; the renderer only knows which are set. Shown inline
    // with a "Renseigner la clé" CTA (errorAction) that opens the key modal, then
    // regenerates in place. (Platform providers need no user key — the platform's backend
    // holds it.)
    return {
      // Même règle que la pastille du sélecteur : la sortie « abonnement » n'est nommée
      // que si ce build a un service hébergé (`platformAccess.ts`).
      text:
        `Clé manquante pour ${PROVIDERS[p.provider].label}. Renseignez-la pour envoyer` +
        (platformAccessServed() ? ` — ou choisissez un modèle inclus ${includedWith(BRAND.name, getMessages(DEFAULT_LOCALE))}.` : "."),
      action: { kind: "missing_key", provider: p.provider, label: PROVIDERS[p.provider].label },
    };
  }

  if (reason === "cli_unavailable") {
    // Conversation épinglée sur un fournisseur CLI (`claude-cli`/`codex-cli`) alors que
    // la CLI a disparu ou que le réglage a été coupé : le chemin de réparation, nommé.
    return {
      text:
        `Ce modèle passe par la CLI ${PROVIDERS[p.provider].label}, introuvable ou ` +
        "désactivée sur cette machine. Installez-la et connectez-la, puis activez-la " +
        "dans Réglages → Modèles — ou choisissez un autre modèle.",
    };
  }

  if (reason === "no_endpoint") {
    // Self-hosted model with no endpoint set. Sending would silently fall back to a
    // default localhost port the user never chose, so fail closed with the real reason.
    return {
      // Le CHEMIN exact reste : c'est un réglage qu'on ne trouve pas au hasard.
      text: "Adresse manquante pour ce modèle local. Ajoutez-la dans Réglages → Modèles.",
    };
  }

  if (reason === "endpoint_unreachable") {
    // Endpoint set but the local server didn't answer the reachability probe — almost
    // always "not started". Blocked here too so the picker's grey and the gate agree.
    return {
      text: "Votre serveur local (Ollama, LM Studio…) ne répond pas. Vérifiez qu'il est démarré, puis réessayez.",
    };
  }

  return null;
}
