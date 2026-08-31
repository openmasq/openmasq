import { describe, it, expect } from "vitest";
import {
  deriveCreditCents,
  creditsCentsForAccountType,
  creditPeriod,
  CREDITS_CENTS_PER_SEAT,
  unlimitedCredits,
} from "./index.js";

describe("deriveCreditCents", () => {
  it("returns 0 for an unpriced/unknown model", () => {
    expect(deriveCreditCents("nope", 1000, 1000)).toBe(0);
    expect(deriveCreditCents(null, 1000, 1000)).toBe(0);
  });

  it("prices a Scaleway platform model (EUR list price × USD_TO_EUR, ceil)", () => {
    // glm-5.2 = 1.8 in / 5.5 out per 1M. 1M in + 1M out = (1.8 + 5.5) × 0.92 × 100.
    const cents = deriveCreditCents("glm-5.2", 1_000_000, 1_000_000);
    expect(cents).toBe(Math.ceil((1.8 + 5.5) * 0.92 * 100));
  });

  it("rounds any priced usage up to ≥ 1 cent", () => {
    expect(deriveCreditCents("glm-5.2", 1, 1)).toBe(1);
  });
});

describe("tier allotment", () => {
  it("maps account types to per-seat eurocents", () => {
    // Solo and Team are DELIBERATELY identical: what separates them is the framework
    // (imposed rules, allowed models, single invoice), not the budget.
    expect(creditsCentsForAccountType("SOLO")).toBe(800);
    expect(creditsCentsForAccountType("TEAM")).toBe(800);
  });
  it("un tier RETIRÉ de la vente garde son allotement (Scale)", () => {
    // Stripe disables a price without deleting it: a subscription taken before the
    // retirement still renews. Putting 0 here would credit nothing to a seat paid 32 €.
    expect(creditsCentsForAccountType("SCALE")).toBe(2800);
  });
  it("FREE/PRO/unknown → 0 (subscription-only)", () => {
    expect(creditsCentsForAccountType("FREE")).toBe(0);
    expect(creditsCentsForAccountType("PRO")).toBe(0);
    expect(creditsCentsForAccountType("???")).toBe(0);
    expect(CREDITS_CENTS_PER_SEAT.FREE).toBe(0);
  });
});

describe("creditPeriod — une fenêtre PÉRIMÉE ne vaut pas « il lui reste tout »", () => {
  const NOW = new Date("2026-08-12T12:00:00.000Z");
  const sub = (start: string, end: string, status = "active") => ({
    subscription_status: status,
    current_period_start: new Date(start),
    current_period_end: new Date(end),
  });
  const isCalendarMonth = (p: { start: Date; end: Date }) =>
    p.start.getUTCDate() === 1 && p.end.getUTCDate() === 1;

  it("une période EN COURS est respectée", () => {
    const p = creditPeriod(sub("2026-08-05T00:00:00Z", "2026-09-05T00:00:00Z"), NOW);
    expect(p.start.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  it("une période ÉCOULÉE retombe sur le mois calendaire", () => {
    // Otherwise: consumption is counted `created_at ∈ [start, end)`, so NO usage
    // from today falls into it → consumed 0 → never blocked → UNLIMITED credits. The case
    // necessarily arises on a granted subscription (no webhook slides its
    // period forward) and on a Stripe subscription whose `invoice.paid` got lost.
    expect(isCalendarMonth(creditPeriod(sub("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"), NOW))).toBe(true);
  });

  it("une période FUTURE (dérive d'horloge) aussi", () => {
    expect(isCalendarMonth(creditPeriod(sub("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z"), NOW))).toBe(true);
  });

  it("un abonnement non payant ou absent : mois calendaire", () => {
    expect(isCalendarMonth(creditPeriod(sub("2026-08-05T00:00:00Z", "2026-09-05T00:00:00Z", "canceled"), NOW))).toBe(true);
    expect(isCalendarMonth(creditPeriod(undefined, NOW))).toBe(true);
  });
});

describe("unlimitedCredits — le statut du MODE GRATUIT", () => {
  it("n'est jamais bloqué, garde la consommation, et le dit par `unlimited`", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-09-01T00:00:00Z");
    const s = unlimitedCredits(12_345, start, end);
    expect(s.blocked).toBe(false);
    expect(s.unlimited).toBe(true);
    expect(s.consumed_cents).toBe(12_345);
    // ⚠️ A client that recomputed `balance ≤ 0` would read "blocked": it's `blocked`
    // that decides, and `unlimited` that explains why it's false despite a zero balance.
    expect(s.allotment_cents).toBe(0);
    expect(s.balance_cents).toBe(0);
    expect(s.period_start).toBe(start.toISOString());
    expect(s.period_end).toBe(end.toISOString());
  });
});
