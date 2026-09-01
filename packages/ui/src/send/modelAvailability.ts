import type { Messages } from "@openmasq/i18n";
import { isFreeModel, isFreeModeModel, type ProviderId } from "@openmasq/llm";
import type { OrgProfileInfo, CreditBalance, BillingSubscription } from "../host";
import { BRAND } from "@openmasq/branding";
import { includedWith, platformAccessServed, subscriptionsSold } from "./platformAccess";

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
  /** With no subscription and no key, free access only serves `FREE_MODE_MODEL_IDS` — and
   *  this one isn't in it. DISTINCT from `no_credits` because the message can't be
   *  the same: "credits exhausted" to someone who never had any, on a model shown as
   *  "free", is wrong twice over. The case happens for real — a conversation
   *  pinned to a `:free` model removed from the list on 18/08. */
  | "free_mode_only"
  /** Claude subscription via the CLI (`claude-cli`): the Claude Code CLI isn't
   *  installed/reachable on this machine, or the setting is off — nothing to
   *  spawn, so nothing to offer. */
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
  /** Is the `claude-cli` provider (Claude subscription via the Claude Code CLI)
   *  usable HERE: setting on AND CLI detected by the host. UNLIKE the
   *  local probe, only `true` OPENS it up — absent/`null`/`false` hides the model. Most
   *  machines don't have the CLI: fail-open would show everyone a model
   *  that fails on the first send. */
  claudeCliReady?: boolean | null;
  /** Same for the `codex-cli` provider (ChatGPT subscription via the Codex CLI). */
  codexCliReady?: boolean | null;
  /** Same for `antigravity-cli` (Google subscription via the `agy` CLI). */
  antigravityCliReady?: boolean | null;
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
    // A CLI that isn't installed (the case for almost everyone): the row would be an
    // ad for a developer tool — activation lives in Réglages → Modèles.
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

  // Claude subscription via the Claude Code CLI: usable ONLY when the host has
  // positively confirmed (setting on + CLI detected). Unknown = unavailable —
  // fail-closed, unlike the local probe (see `claudeCliReady`).
  if (provider === "claude-cli") {
    return p.claudeCliReady === true ? null : "cli_unavailable";
  }
  if (provider === "codex-cli") {
    return p.codexCliReady === true ? null : "cli_unavailable";
  }
  if (provider === "antigravity-cli") {
    return p.antigravityCliReady === true ? null : "cli_unavailable";
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
    // ⚠️ WITH NO BUDGET, it's no longer PRICE that opens it up but the LIST (18/08). An
    // OpenRouter `:free` isn't billed per token, but it draws on OUR key's quota,
    // shared: the catalogue's ~20 free tiers are open to anyone paying nothing, and a
    // handful of accounts can drain the queue for everyone. Two models named, one single home
    // (`FREE_MODE_MODEL_IDS`), which the gateway re-reads — the guard here is UX only.
    if (isFreeModeModel(p.model.id)) return null;
    // A PAID model still reads "subscription required" — nothing changed for it. The
    // new reason covers ONLY the new case: a model shown as "free" (price 0/0) that isn't
    // in the free offer. Answering it "credits exhausted" would be wrong twice over.
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
  t: Messages,
): { chip: string; title: string } {
  const a = t.availability;
  switch (reason) {
    case "no_key":
      return {
        chip: a.keyRequired,
        // The second way out only exists IF this build has a hosted service: promising it
        // in a build that has none (self-hosted, local) would send the user looking for a
        // subscription that doesn't exist.
        title:
          a.noKeyTitle(providerLabel) +
          (platformAccessServed() ? a.noKeyOrIncluded(includedWith(BRAND.name, t)) : "."),
      };
    // A build that SELLS nothing (`subscriptionsSold`, the default) says neither "subscription"
    // nor "credits": the model isn't open on this account, and the key is the way out.
    case "no_credits":
      return subscriptionsSold()
        ? { chip: a.subscriptionRequired, title: a.noCreditsSold(BRAND.name, providerLabel) }
        : { chip: a.unavailable, title: a.noCreditsUnsold(BRAND.name, providerLabel) };
    case "free_mode_only":
      return subscriptionsSold()
        ? { chip: a.subscriptionRequired, title: a.freeModeSold(BRAND.name, providerLabel) }
        : { chip: a.keyRequired, title: a.freeModeUnsold(BRAND.name, providerLabel) };
    case "cli_unavailable":
      // `providerLabel` = the provider's CLI ("Claude Code", "Gemini CLI").
      return { chip: a.cliRequired, title: a.cliUnavailable(providerLabel) };
    case "no_endpoint":
      return { chip: a.noEndpoint, title: a.noEndpointTitle };
    case "endpoint_unreachable":
      return { chip: a.endpointUnreachable, title: a.endpointUnreachableTitle };
  }
}
