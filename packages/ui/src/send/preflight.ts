import type { Messages } from "@openmasq/i18n";
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
  /** Is the `claude-cli` provider ready (setting enabled + CLI detected)? Passed
   *  as-is to `modelUnavailableReason` — only `true` opens it (fail-closed). */
  claudeCliReady?: boolean | null;
  /** Same for `codex-cli`. */
  codexCliReady?: boolean | null;
  /** Same for `antigravity-cli`. */
  antigravityCliReady?: boolean | null;
  /** The UI language of the failure text. */
  t: Messages;
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
  const { t } = p;
  const label = PROVIDERS[p.provider].label;
  // Org governance. A suspended member can't send (the backend already 403s their
  // org calls; fail closed here too). And a member cannot send with a model their org
  // disabled — the picker hides it, but a conversation pinned to a now-blocked model
  // must FAIL CLOSED (shown inline so the reason sticks).
  if (p.orgProfile?.status === "suspended") {
    return { text: t.runtime.send.suspended };
  }
  // ALLOW-list: the model must appear in what the organization has opened up. A model
  // absent from the list is refused — including a model that joined the catalog after
  // the policy was written, which the old deny-list would have let through.
  if (p.orgProfile && !(p.orgProfile.allowedModelIds ?? []).includes(p.model.id)) {
    return { text: new ModelBlockedByOrgError(p.model.id, p.model.label, t).message };
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
    antigravityCliReady: p.antigravityCliReady,
  });

  // FREE ACCESS serves only two models (`FREE_MODE_MODEL_IDS`): this one isn't one of
  // them, and there is NEITHER a subscription NOR a key. We say so plainly — « crédits
  // épuisés » would be wrong (no credit ever existed) for a model the catalog shows as
  // « gratuit ». Both outcomes are the same as for an exhausted budget, hence the same
  // action card: take a subscription, or provide your own key.
  if (reason === "free_mode_only") {
    return {
      // With nothing to sell (`subscriptionsSold`, the default), the only way out is the key.
      // The SAME sentence the picker's tooltip shows (`availability`, rule 9).
      text: subscriptionsSold()
        ? t.availability.freeModeSold(BRAND.name, label)
        : t.availability.freeModeUnsold(BRAND.name, label),
      action: p.hasBilling
        ? { kind: "credit_options", provider: p.provider, label }
        : { kind: "missing_key", provider: p.provider, label },
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
        return { text: t.runtime.send.paidUnavailable };
      }
      return {
        text: new CreditsExhaustedError(true, t).message,
        action: { kind: "credit_options", provider: p.provider, label },
      };
    }
    const personalCreditsBlocked = !p.orgProfile && (p.personalCredits?.blocked ?? false);
    // Org member (budget managed by the admin) or account with no billing: the
    // ACTIONABLE half of the message — « utilisez votre propre clé » — becomes a button
    // instead of dead text (log 02/08: a card with no way out). `missing_key` opens the
    // provider's key modal then regenerates in place, existing plumbing; the subscription
    // option stays the admin's call, so no upsell card here.
    return {
      text: new CreditsExhaustedError(personalCreditsBlocked, t).message,
      action: { kind: "missing_key", provider: p.provider, label },
    };
  }

  if (reason === "no_key") {
    // Keys live encrypted in main; the renderer only knows which are set. Shown inline
    // with a "Renseigner la clé" CTA (errorAction) that opens the key modal, then
    // regenerates in place. (Platform providers need no user key — the platform's backend
    // holds it.)
    return {
      // Same rule as the picker's chip: the « abonnement » way out is named only if
      // this build has a hosted service (`platformAccess.ts`).
      text:
        t.availability.noKeyTitle(label) +
        (platformAccessServed() ? t.availability.noKeyOrIncluded(includedWith(BRAND.name, t)) : "."),
      action: { kind: "missing_key", provider: p.provider, label },
    };
  }

  if (reason === "cli_unavailable") {
    // Conversation pinned on a CLI provider (`claude-cli`/`codex-cli`/
    // `antigravity-cli`) while
    // the CLI has disappeared or the setting was switched off: the repair path, named.
    return { text: t.availability.cliUnavailable(label) };
  }

  if (reason === "no_endpoint") {
    // Self-hosted model with no endpoint set. Sending would silently fall back to a
    // default localhost port the user never chose, so fail closed with the real reason.
    // The exact PATH stays: it's a setting you don't stumble on by chance.
    return { text: t.availability.noEndpointTitle };
  }

  if (reason === "endpoint_unreachable") {
    // Endpoint set but the local server didn't answer the reachability probe — almost
    // always "not started". Blocked here too so the picker's grey and the gate agree.
    return { text: t.availability.endpointUnreachableTitle };
  }

  return null;
}
