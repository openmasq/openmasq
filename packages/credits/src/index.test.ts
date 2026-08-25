import { describe, it, expect } from "vitest";
import {
  deriveCreditCents,
  creditsCentsForAccountType,
  creditPeriod,
  CREDITS_CENTS_PER_SEAT,
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
    // Solo et Team sont VOLONTAIREMENT identiques : ce qui les sépare est le cadre
    // (règles imposées, modèles autorisés, facture unique), pas l'enveloppe.
    expect(creditsCentsForAccountType("SOLO")).toBe(800);
    expect(creditsCentsForAccountType("TEAM")).toBe(800);
  });
  it("un tier RETIRÉ de la vente garde son allotement (Scale)", () => {
    // Stripe désactive un prix sans le supprimer : un abonnement pris avant le retrait
    // se renouvelle encore. Mettre 0 ici créditerait rien à un siège payé 32 €.
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
    // Sinon : la consommation se compte `created_at ∈ [start, end)`, donc AUCUN usage
    // d'aujourd'hui n'y tombe → consommé 0 → jamais bloqué → crédits ILLIMITÉS. Le cas
    // arrive forcément sur un abonnement octroyé (aucun webhook ne fait glisser sa
    // période) et sur un abonnement Stripe dont un `invoice.paid` s'est perdu.
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
