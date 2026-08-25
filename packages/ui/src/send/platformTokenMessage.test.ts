import { describe, expect, it } from "vitest";
import { platformTokenFailure } from "./platformTokenMessage";
import { BRAND } from "@openmasq/branding";

const none = { ok: false, reason: "none" } as const;
const err = { ok: false, reason: "error" } as const;
const timeout = { ok: false, reason: "timeout" } as const;
const paying = { tier: "solo" };
const free = { tier: "free" };

describe("platformTokenFailure — the copy states only what is TRUE", () => {
  it("an outage (timeout OR fast error) never mentions the account or a plan", () => {
    // The reported bug: auth server unreachable, subscription active — the user was
    // told « prenez un abonnement ». An outage says outage, whatever the model or plan.
    for (const tok of [timeout, err]) {
      for (const personalSub of [paying, free, null]) {
        for (const freeModel of [true, false]) {
          const out = platformTokenFailure(tok, { freeModel, personalSub });
          expect(out.text).toMatch(/ne répond pas/);
          expect(out.text).not.toMatch(/abonnement|Reconnectez/);
          expect(out.action).toBeUndefined();
        }
      }
    }
  });

  it("signed out + a KNOWN paying tier: reconnect, never « prenez un abonnement »", () => {
    const out = platformTokenFailure(none, { freeModel: false, personalSub: paying });
    expect(out.text).toMatch(new RegExp(`abonnement ${BRAND.name} couvre ce modèle`));
    expect(out.text).toMatch(/Reconnectez-vous/);
    expect(out.action).toBeUndefined();
  });

  it("signed out on a FREE model: account only, no subscription pitch", () => {
    // Even with no cached sub — a gratuit never needs a plan.
    const out = platformTokenFailure(none, { freeModel: true, personalSub: null });
    expect(out.text).toMatch(/gratuit/);
    expect(out.text).not.toMatch(/prenez un abonnement/);
    expect(out.action).toBeUndefined();
  });

  it("signed out with an UNKNOWN plan: no claim about a plan, no upgrade CTA", () => {
    // The « Réessayer » bug: offline cold start ⇒ the in-memory billing cache is empty
    // AND supabase has settled to "no session", so a subscriber's retry landed here and
    // was told « Abonnement requis ». Absence of evidence is not a free tier.
    for (const personalSub of [null, undefined]) {
      const out = platformTokenFailure(none, { freeModel: false, personalSub });
      expect(out.text).toMatch(/Reconnectez-vous/);
      expect(out.text).not.toMatch(new RegExp(`abonnement ${BRAND.name}\\.|prenez un abonnement`));
      expect(out.action).toBeUndefined();
    }
  });

  it("signed out on a KNOWN free tier: the subscription pitch + CTA — the one true case", () => {
    const out = platformTokenFailure(none, { freeModel: false, personalSub: free });
    expect(out.text).toMatch(/prenez un abonnement/);
    expect(out.action).toEqual({ kind: "upgrade_plan" });
  });
});
