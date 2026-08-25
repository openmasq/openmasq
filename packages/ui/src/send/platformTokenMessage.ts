import type { Message } from "../types";
import { knownTier } from "../state/billing";
import type { PlatformTokenResult } from "./tokenFetch";
import { BRAND } from "@openmasq/branding";

/**
 * The copy shown when a PLATFORM send can't get its JWT — pure, because every branch
 * here is a factual claim about the user's situation and a wrong one reads as a lie:
 *
 *  - `timeout` / `error` — the auth server didn't answer (hang or fast network failure,
 *    same user truth): an OUTAGE. No « reconnectez-vous », no upsell — the session may be
 *    perfectly fine. This is the case that used to show a PAYING user « Abonnement requis »
 *    because their connection dropped: `error` was collapsed into `none` upstream.
 *  - `none` — the fetch SETTLED null: genuinely signed out. Then:
 *      · a FREE model needs a connected account and nothing else — never pitch a
 *        subscription for it;
 *      · an account whose CACHED billing shows a paying tier already HAS the plan —
 *        « prenez un abonnement » would be false, so it only gets « reconnectez-vous » ;
 *      · an UNKNOWN plan (`knownTier` → null) says NOTHING about a plan and offers no
 *        upgrade CTA. This is the common case on a cold start with no network: the
 *        billing cache is in memory, so it is empty, and after a failed refresh supabase
 *        settles to "no session" — which is how a paying user clicking « Réessayer » got
 *        « Abonnement requis ». Absence of evidence is not a free tier;
 *      · only a KNOWN free tier gets the subscription pitch + its CTA, because only
 *        there is « prenez un abonnement » a true statement.
 */
export function platformTokenFailure(
  tok: Exclude<PlatformTokenResult, { ok: true }> | { ok: true },
  p: {
    /** The model is free-tier on the platform (no subscription involved). */
    freeModel: boolean;
    /** Cached per-account subscription snapshot — `null` = unknown, NOT "free". */
    personalSub: { tier?: string } | null | undefined;
  },
): { text: string; action?: Message["errorAction"] } {
  if (!tok.ok && (tok.reason === "timeout" || tok.reason === "error")) {
    return {
      text: `Le serveur de connexion ${BRAND.name} ne répond pas — rien n'est parti. Vérifiez votre connexion, puis réessayez.`,
    };
  }
  if (p.freeModel) {
    return {
      // « ne demande que votre compte » compte ici : sans ça, une session expirée se
      // lit comme un mur payant sur un modèle gratuit.
      text: `Reconnectez-vous pour continuer — ce modèle gratuit ne demande que votre compte ${BRAND.name}.`,
    };
  }
  const tier = knownTier(p.personalSub);
  if (tier === null) {
    return {
      text: `Ce modèle passe par votre compte ${BRAND.name}. Votre session n'est plus connectée. Reconnectez-vous.`,
    };
  }
  if (tier !== "free") {
    return {
      text: `Votre abonnement ${BRAND.name} couvre ce modèle. Votre session n'est plus connectée. Reconnectez-vous.`,
    };
  }
  return {
    text: `Ce modèle est inclus dans l'abonnement ${BRAND.name} : prenez un abonnement pour l'utiliser, ou renseignez votre propre clé.`,
    action: { kind: "upgrade_plan" },
  };
}
