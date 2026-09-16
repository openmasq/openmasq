import { isFreeModel } from "@openmasq/llm";
import { platformTokenFailure } from "../platformTokenMessage";
import { preflightError } from "../preflight";
import { resolveEffectivePlatform } from "../routing";
import { fetchPlatformToken } from "../tokenFetch";
import type { TurnContext } from "./turnSetup";

/** How this send reaches its model: direct with the user's key, or through the app's metered gateway. */
export interface Routing {
  /** True when the turn is proxied through the gateway (subscription/credits). */
  effectivePlatform: boolean;
  platformBaseUrl: string | undefined;
  platformToken: string | undefined;
}

/**
 * Pre-flight gate, FAIL CLOSED (`send/preflight.ts`): org suspension, org-blocked model,
 * exhausted credits, missing key, unconfigured endpoint. A refusal is an inline failed
 * turn and no wire leaves. Then, for a platform-routed model, resolves the base URL and
 * a fresh token once for this send. Returns null when the turn was refused.
 */
export async function gateAndRoute(ctx: TurnContext): Promise<Routing | null> {
  const { d, model, provider, failTurn } = ctx;
  const { host, settings, keyConfigured } = d;
  // One decision for the gate AND the token block: a platform provider is proxied unless
  // the user configured that provider's own key, and the billing-mode switch can force it.
  const effectivePlatform = resolveEffectivePlatform(provider, model.id, settings.billingMode, keyConfigured);
  const preflightFail = preflightError({
    orgProfile: d.orgProfileRef.current,
    personalCredits: d.personalCreditsRef.current,
    personalSub: d.personalSubRef.current,
    keyConfigured,
    hasBilling: !!host.billing,
    provider,
    model,
    effectivePlatform,
    openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
    localEndpointReachable: d.localEndpointReachableRef.current,
    claudeCliReady: d.claudeCliReadyRef.current,
    codexCliReady: d.codexCliReadyRef.current,
    antigravityCliReady: d.antigravityCliReadyRef.current,
  });
  if (preflightFail) {
    failTurn(preflightFail.text, preflightFail.action);
    return null;
  }

  let platformBaseUrl: string | undefined;
  let platformToken: string | undefined;
  if (effectivePlatform) {
    platformBaseUrl = host.inferenceUrl;
    // Hang-guarded, and forces ONE `reconnect()` when the session yields no token: a send
    // is what self-heals after an auth outage (`send/tokenFetch.ts`).
    const tok = await fetchPlatformToken(
      host.auth?.getAccessToken ? () => host.auth!.getAccessToken!() : undefined,
      { reconnect: host.auth?.reconnect ? () => host.auth!.reconnect!() : undefined },
    );
    platformToken = tok.ok ? tok.token : undefined;
    if (!platformBaseUrl || !tok.ok) {
      const fail = platformTokenFailure(tok, {
        freeModel: isFreeModel(model.id),
        personalSub: d.personalSubRef.current,
      });
      failTurn(fail.text, fail.action);
      return null;
    }
  }
  return { effectivePlatform, platformBaseUrl, platformToken };
}
