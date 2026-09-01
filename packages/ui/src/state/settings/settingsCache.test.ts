import { describe, it, expect } from "vitest";
import { billingFor, selectBillingCache, setBillingCache, type BillingCache } from "./settingsCache";
import { store as reduxStore } from "../redux";
import { modelUnavailableReason } from "../../send/modelAvailability";

// The billing cache is the SINGLE source the model picker AND Réglages → Paiement read
// (rule 9). These pin the two ways that pairing can go wrong: a stale/foreign snapshot
// greying a plan it doesn't describe, and a fresh paid snapshot failing to un-grey.

const CACHE = (o: Partial<BillingCache> = {}): BillingCache => ({
  sub: null,
  credits: null,
  userId: "u1",
  loaded: true,
  ...o,
});

const PAID_PLATFORM_MODEL = {
  model: { id: "scaleway/gpt-oss-120b", provider: "scaleway" as const },
  effectivePlatform: true,
  orgProfile: null,
  keyConfigured: new Set<string>(),
  openaiCompatBaseUrl: "",
};

describe("billingFor", () => {
  const sub = { tier: "solo", status: "active" };
  const credits = { blocked: false, allotmentCents: 100, consumedCents: 0, balanceCents: 100 };

  it("returns the snapshot for the account it was fetched for", () => {
    expect(billingFor(CACHE({ sub, credits }), "u1")).toEqual({ sub, credits });
  });

  it("is UNKNOWN (nulls) for another account, an unresolved account, or an unloaded cache", () => {
    expect(billingFor(CACHE({ sub, credits }), "u2")).toEqual({ sub: null, credits: null });
    expect(billingFor(CACHE({ sub, credits }), undefined)).toEqual({ sub: null, credits: null });
    expect(billingFor(CACHE({ sub, credits, loaded: false }), "u1")).toEqual({
      sub: null,
      credits: null,
    });
  });

  it("keeps a signed-out snapshot (userId null) addressable by a signed-out reader", () => {
    expect(billingFor(CACHE({ userId: null, sub }), null)).toEqual({ sub, credits: null });
  });
});

describe("the picker follows the cache (regression: paid plan, only free models offered)", () => {
  const free = { tier: "free", status: "free" };
  const solo = { tier: "solo", status: "active" };

  it("greys a paid platform model on a KNOWN free tier…", () => {
    const { sub, credits } = billingFor(CACHE({ sub: free }), "u1");
    expect(
      modelUnavailableReason({ ...PAID_PLATFORM_MODEL, personalSub: sub, personalCredits: credits }),
    ).toBe("no_credits");
  });

  it("…and un-greys it as soon as the cache carries the paid tier — no restart", () => {
    // What the checkout-return poll writes. The store used to hold a private copy that
    // this dispatch never reached, so every paid model stayed « Abonnement requis » for
    // the whole session that had just paid for them.
    const { sub, credits } = billingFor(CACHE({ sub: solo }), "u1");
    expect(
      modelUnavailableReason({ ...PAID_PLATFORM_MODEL, personalSub: sub, personalCredits: credits }),
    ).toBeNull();
  });

  it("never greys on ANOTHER account's free snapshot (unknown ⇒ the gateway decides)", () => {
    const { sub, credits } = billingFor(CACHE({ sub: free, userId: "someone-else" }), "u1");
    expect(
      modelUnavailableReason({ ...PAID_PLATFORM_MODEL, personalSub: sub, personalCredits: credits }),
    ).toBeNull();
  });

  // The channel itself: the store subscribes to THIS redux store, so what `loadBilling`
  // dispatches (on account resolve, and on the checkout-return poll) is what the picker
  // reads on the next snapshot. Without it a purchase only reached the Paiement tab.
  it("a dispatched refresh reaches the picker's snapshot, no remount", () => {
    const greyed = () => {
      const { sub, credits } = billingFor(selectBillingCache(reduxStore.getState()), "u1");
      return modelUnavailableReason({
        ...PAID_PLATFORM_MODEL,
        personalSub: sub,
        personalCredits: credits,
      });
    };
    reduxStore.dispatch(setBillingCache({ sub: free, credits: null, userId: "u1" }));
    expect(greyed()).toBe("no_credits");
    reduxStore.dispatch(setBillingCache({ sub: solo, credits: null, userId: "u1" }));
    expect(greyed()).toBeNull();
  });
});
