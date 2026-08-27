import { isFreeModel, isFreeModeModel, type ProviderId } from "@openmasq/llm";
import type { OrgProfileInfo, CreditBalance, BillingSubscription } from "../host";
import { BRAND } from "@openmasq/branding";
import { platformAccessServed } from "./platformAccess";

/**
 * Can this model actually SEND right now — and if not, why?
 *
 * This is the SINGLE source for that decision (hard rule 9): `preflightError` (the
 * fail-closed send gate) and the model pickers (which grey out what you can't pick)
 * both call it, so the picker can never advertise a model the gate would refuse, nor
 * grey one that would actually work.
 *
 * It answers ONLY "is it usable", never "should it be shown": org-blocked models are
 * HIDDEN by `selectableModels` and a suspended member is blocked wholesale — both stay
 * in `preflightError`, which owns the org-governance layer on top of this.
 *
 * ⚠️ The picker's greying is UX, NOT a boundary — `preflightError` re-checks on every
 * send (the renderer is untrusted for security decisions), and the gateway re-checks
 * credits server-side.
 */
export type UnavailableReason =
  /** A BYO-only provider whose API key isn't stored on this machine. */
  | "no_key"
  /** Routed through the app's metered gateway, but the prepaid budget is exhausted. */
  | "no_credits"
  /** Sans abonnement ni clé, l'accès gratuit ne sert que `FREE_MODE_MODEL_IDS` — et
   *  celui-ci n'y est pas. DISTINCT de `no_credits` parce que le message ne peut pas être
   *  le même : « crédits épuisés » à quelqu'un qui n'en a jamais eu, sur un modèle affiché
   *  « gratuit », est faux deux fois. Le cas se rencontre pour de vrai — une conversation
   *  épinglée à un `:free` retiré de la liste le 18/08. */
  | "free_mode_only"
  /** Abonnement Claude via la CLI (`claude-cli`) : la CLI Claude Code n'est pas
   *  installée/joignable sur cette machine, ou le réglage est désactivé — rien à
   *  spawner, donc rien à proposer. */
  | "cli_unavailable"
  /** Self-hosted (openai-compat): no endpoint URL configured, so there's nothing to call. */
  | "no_endpoint"
  /** Self-hosted (openai-compat): an endpoint IS configured, but the local server
   *  (Ollama / LM Studio) didn't answer a reachability probe — it's likely not running. */
  | "endpoint_unreachable";

export interface AvailabilityInput {
  model: { id: string; provider: ProviderId };
  /** The routing decision from `resolveEffectivePlatform` — does this send draw on
   *  the app's gateway/credits (platform provider AND no personal key / subscription
   *  mode), or go DIRECT with the user's own key? Passed in rather than recomputed so
   *  the picker and the send gate can't route differently. */
  effectivePlatform: boolean;
  orgProfile: OrgProfileInfo | null;
  personalCredits: CreditBalance | null;
  /** The INDIVIDUAL account's subscription (null = unknown / still loading / no billing).
   *  A KNOWN free tier has NO platform budget (`@openmasq/credits`: FREE allotment = 0),
   *  so its non-free platform models are subscription-or-key only. Null never blocks (no
   *  load flicker for a paying user). */
  personalSub?: BillingSubscription | null;
  /** Providers whose key is configured (a plain string set in the store). */
  keyConfigured: ReadonlySet<string>;
  /** `Settings.openaiCompatBaseUrl` — the self-hosted endpoint, blank = unset. */
  openaiCompatBaseUrl: string;
  /** Result of the last reachability probe of the local endpoint: `true` = the server
   *  answered, `false` = it didn't (likely off), `null`/absent = not probed yet / unknown.
   *  Only `false` blocks — an UNKNOWN result never greys a model (fail-open on the probe,
   *  the send has its own "modèle injoignable" handling). */
  localEndpointReachable?: boolean | null;
  /** Le fournisseur `claude-cli` (abonnement Claude via la CLI Claude Code) est-il
   *  utilisable ICI : réglage activé ET CLI détectée par le host. À l'INVERSE du
   *  probe local, seul `true` OUVRE — absent/`null`/`false` cache le modèle. La
   *  plupart des machines n'ont pas la CLI : fail-open afficherait à tous un modèle
   *  qui échoue au premier envoi. */
  claudeCliReady?: boolean | null;
  /** Idem pour le fournisseur `codex-cli` (abonnement ChatGPT via la CLI Codex). */
  codexCliReady?: boolean | null;
}

/**
 * Does this reason DISABLE the row in a picker — or only inform it?
 *
 * Only a self-hosted model with literally NOTHING to call. It stays VISIBLE (greyed)
 * on purpose: the fix is on the user's own machine — start Ollama, set the endpoint —
 * so hiding the row would hide the very thing they configured.
 */
export function pickerBlocks(reason: UnavailableReason): boolean {
  return reason === "no_endpoint" || reason === "endpoint_unreachable";
}

/**
 * Does this reason HIDE the row from a picker entirely?
 *
 * Product decision (02/08, reversing the earlier one): a picker lists ONLY what the
 * account can actually send — what its subscription covers, what its keys unlock, and
 * the free tiers. A model gated by MONEY (`no_credits`) or by a MISSING KEY is not
 * offered at all. The catalogue used to show everything greyed with a « Clé requise » /
 * « Abonnement requis » chip; with the five big vendors now personal-key-only, that
 * turned most of the list into an advert for things the user cannot use.
 *
 * ⚠️ Two things this must never do, both pinned in `modelAvailability.test.ts`:
 * hide a LOCAL model (see `pickerBlocks`), and hide the CURRENT selection — a
 * conversation pinned to a model whose key was just removed must still show what it is
 * set to (`visibleModels`'s `keepId`), or the setting reads as empty.
 */
export function pickerHides(reason: UnavailableReason): boolean {
  return (
    reason === "no_key" ||
    reason === "no_credits" ||
    reason === "free_mode_only" ||
    // Une CLI non installée (le cas de presque tout le monde) : la ligne serait une
    // pub pour un outil de développeur — l'activation vit dans Réglages → Modèles.
    reason === "cli_unavailable"
  );
}

/**
 * The models a picker may LIST: everything usable now, plus the hard-blocked local
 * rows (greyed, see `pickerBlocks`), plus `keepId` whatever its state.
 *
 * `unavailable` is the store's pre-computed `id → reason` map, so this stays a pure
 * filter — the availability decision itself is `modelUnavailableReason`'s, once, for
 * both pickers and the send gate (rule 9). An ABSENT map means "not computed yet" and
 * hides nothing: a picker must not blink empty while billing loads.
 */
export function visibleModels<T extends { id: string }>(
  models: readonly T[],
  unavailable: ReadonlyMap<string, UnavailableReason> | undefined,
  keepId?: string | null,
): T[] {
  if (!unavailable) return [...models];
  return models.filter((m) => {
    if (m.id === keepId) return true;
    const reason = unavailable.get(m.id);
    return !reason || !pickerHides(reason);
  });
}

export function modelUnavailableReason(p: AvailabilityInput): UnavailableReason | null {
  const { provider } = p.model;

  // Abonnement Claude via la CLI Claude Code : utilisable UNIQUEMENT quand le host a
  // positivement confirmé (réglage activé + CLI détectée). Inconnu = indisponible —
  // fail-closed, contrairement au probe local (voir `claudeCliReady`).
  if (provider === "claude-cli") {
    return p.claudeCliReady === true ? null : "cli_unavailable";
  }
  if (provider === "codex-cli") {
    return p.codexCliReady === true ? null : "cli_unavailable";
  }

  // Self-hosted / local (Ollama, LM Studio…): the ONLY thing that makes it reachable is
  // the endpoint the user configured. Blank ⇒ nothing to call, so fail closed rather
  // than silently falling back to a default localhost port the user never asked for.
  if (provider === "openai-compat") {
    if (!p.openaiCompatBaseUrl.trim()) return "no_endpoint";
    // Endpoint set: block ONLY on a confirmed failed probe. Unknown (not yet probed) stays
    // usable — a slow/absent probe must never grey a model the user just configured.
    if (p.localEndpointReachable === false) return "endpoint_unreachable";
    return null;
  }

  // Platform-routed (the platform's key, metered): gated on the prepaid budget.
  if (p.effectivePlatform) {
    // Org member → the ORG's prepaid budget decides (admin-managed). Individual: FREE tier
    // has ZERO platform budget (`@openmasq/credits` tiers), so it counts as no budget.
    // Block when the budget is exhausted OR the subscription is KNOWN to be the free tier.
    // A null/unknown sub is NOT blocked — avoids a load-time flicker for a paying user; the
    // send re-checks and the gateway enforces server-side anyway.
    const noBudget = p.orgProfile
      ? (p.orgProfile.credits?.blocked ?? false)
      : (p.personalCredits?.blocked ?? false) ||
        (!!p.personalSub && (p.personalSub.tier ?? "free") === "free");
    if (!noBudget) return null;
    // ⚠️ SANS BUDGET, ce n'est plus le PRIX qui ouvre mais la LISTE (18/08). Un `:free`
    // d'OpenRouter ne se facture pas au jeton, mais il consomme le quota de NOTRE clé,
    // partagé : les ~20 tiers gratuits du catalogue ouverts à qui ne paie rien, et une
    // poignée de comptes assèche la file de tous. Deux modèles nommés, un seul foyer
    // (`FREE_MODE_MODEL_IDS`), que la passerelle relit — la garde d'ici est de l'UX.
    if (isFreeModeModel(p.model.id)) return null;
    // Un modèle PAYANT reste « abonnement requis » — rien n'a changé pour lui. La raison
    // neuve ne couvre QUE le cas neuf : un modèle affiché « gratuit » (prix 0/0) qui n'est
    // pas dans l'offre gratuite. Lui répondre « crédits épuisés » serait faux deux fois.
    return isFreeModel(p.model.id) ? "free_mode_only" : "no_credits";
  }

  // Not platform-routed: either a BYO-only provider, a platform provider whose key the
  // user configured (routes DIRECT → usable), or a model the gateway cannot serve on
  // the platform's key — a dynamically-discovered OpenRouter slug is BYO-only, fail-closed
  // (`isPlatformServableModel` made `effectivePlatform` false). In every case the ONLY
  // thing that unlocks it is the provider's own key.
  if (!p.keyConfigured.has(provider)) return "no_key";
  return null;
}

/** The chip + tooltip shown on a greyed-out model row. `providerLabel` names the
 *  provider whose key would unlock it (`PROVIDERS[p].label`). */
export function unavailableLabel(
  reason: UnavailableReason,
  providerLabel: string,
): { chip: string; title: string } {
  switch (reason) {
    case "no_key":
      return {
        chip: "Clé requise",
        // La seconde issue n'existe QUE si ce build a un service hébergé : la promettre
        // dans un build qui n'en a pas (auto-hébergé, local) enverrait chercher un
        // abonnement introuvable.
        title:
          `Aucune clé API ${providerLabel} n'est enregistrée sur cet appareil — ajoutez-la dans Réglages → Modèles pour utiliser ce modèle` +
          (platformAccessServed() ? `, ou choisissez un modèle inclus dans l'abonnement ${BRAND.name}.` : "."),
      };
    case "no_credits":
      return {
        chip: "Abonnement requis",
        title: `Ce modèle passe par votre abonnement ${BRAND.name}, et vos crédits sont épuisés. Prenez un abonnement, ou renseignez votre propre clé ${providerLabel} pour l'utiliser directement.`,
      };
    case "free_mode_only":
      return {
        chip: "Abonnement requis",
        title:
          `L'accès gratuit de ${BRAND.name} sert Laguna et Nemotron. Pour ce modèle, prenez un ` +
          `abonnement ou renseignez votre propre clé ${providerLabel}.`,
      };
    case "cli_unavailable":
      // `providerLabel` = la CLI du fournisseur (« Claude Code », « Gemini CLI »).
      return {
        chip: "CLI requise",
        title:
          `Ce modèle passe par la CLI ${providerLabel} installée sur cette machine. ` +
          "Installez-la et connectez-la, puis activez-la dans Réglages → Modèles.",
      };
    case "no_endpoint":
      return {
        chip: "Adresse manquante",
        title:
          "Adresse manquante — ajoutez-la dans Réglages → Modèles → Modèle sur votre ordinateur.",
      };
    case "endpoint_unreachable":
      return {
        chip: "Serveur injoignable",
        title:
          "Votre serveur local (Ollama, LM Studio…) ne répond pas. Vérifiez qu'il est démarré.",
      };
  }
}
