import { describe, it, expect } from "vitest";
import { hasEstablishedAccount } from "./establishedAccount";
import type { BillingSubscription, OrgProfileInfo } from "../host";

const paid = (tier: string): BillingSubscription => ({ tier, status: "active" });

describe("hasEstablishedAccount — l'accueil ne se rejoue pas sur le 2e appareil", () => {
  it("un abonnement payant chargé ⇒ établi (chaque palier)", () => {
    for (const tier of ["solo", "team", "scale"]) {
      expect(hasEstablishedAccount({ personalSub: paid(tier), orgProfile: null })).toBe(true);
    }
  });

  it("membre d'une organisation ⇒ établi, quel que soit l'abonnement personnel", () => {
    const org = { role: "member" } as unknown as OrgProfileInfo;
    expect(hasEstablishedAccount({ personalSub: null, orgProfile: org })).toBe(true);
    expect(hasEstablishedAccount({ personalSub: paid("free"), orgProfile: org })).toBe(true);
  });

  it("⚠️ null = PAS ENCORE CHARGÉ, jamais « établi » — on ne saute pas avant de savoir", () => {
    expect(hasEstablishedAccount({ personalSub: null, orgProfile: null })).toBe(false);
  });

  it("un palier gratuit CONNU n'établit rien : le vrai nouveau venu garde son accueil", () => {
    expect(hasEstablishedAccount({ personalSub: paid("free"), orgProfile: null })).toBe(false);
    // Un tier absent se lit « free », pas « payant ».
    expect(
      hasEstablishedAccount({
        personalSub: { status: "free" } as unknown as BillingSubscription,
        orgProfile: null,
      }),
    ).toBe(false);
  });
});
