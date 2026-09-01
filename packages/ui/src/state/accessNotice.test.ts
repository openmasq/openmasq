import { describe, expect, it } from "vitest";
import { needsAccessNotice, type AccessNoticeInput } from "./accessNotice";

const base: AccessNoticeInput = {
  keyConfigured: new Set(),
  personalSub: { tier: "free", status: "free" },
  personalCredits: null,
  orgProfile: null,
  hasBilling: true,
};

describe("needsAccessNotice", () => {
  it("prévient quand il n'y a NI abonnement NI clé", () => {
    expect(needsAccessNotice(base)).toBe(true);
  });

  it("se tait dès qu'UNE clé, n'importe laquelle, est enregistrée", () => {
    expect(needsAccessNotice({ ...base, keyConfigured: new Set(["openrouter"]) })).toBe(false);
  });

  it("se tait dès qu'un abonnement payant existe", () => {
    expect(
      needsAccessNotice({ ...base, personalSub: { tier: "solo", status: "active" } }),
    ).toBe(false);
  });

  // The startup trap: billing arrives AFTER the first render. Treating
  // « not loaded yet » as « no subscription » would flash the banner at
  // someone who pays — the worst person to tell they're missing a subscription.
  it("ne dit rien tant que l'abonnement n'est pas chargé", () => {
    expect(needsAccessNotice({ ...base, personalSub: null })).toBe(false);
  });

  it("se tait pour un membre d'organisation — ses accès ne sont pas à lui d'acheter", () => {
    expect(
      needsAccessNotice({
        ...base,
        orgProfile: { status: "active", blockedModelIds: [] } as never,
      }),
    ).toBe(false);
  });

  it("se tait quand la plateforme n'a rien à vendre (aperçu web)", () => {
    expect(needsAccessNotice({ ...base, hasBilling: false })).toBe(false);
  });

  // A remaining credit IS access. When it runs out, it's the send block that
  // says so, with its buttons — not a permanent banner above the composer.
  it("se tait tant qu'il reste des crédits, prévient quand ils sont bloqués", () => {
    const credits = { allotmentCents: 800, consumedCents: 100, balanceCents: 700 };
    expect(needsAccessNotice({ ...base, personalCredits: { ...credits, blocked: false } })).toBe(false);
    expect(needsAccessNotice({ ...base, personalCredits: { ...credits, blocked: true } })).toBe(true);
  });
});
