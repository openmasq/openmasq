import { describe, it, expect } from "vitest";
import { resetLabel, usedPct } from "./CreditsCard";

/**
 * The credits card sits on a BILLING surface, so its two pure helpers exist to make
 * "never show a number we don't have" mechanical rather than a matter of care.
 */
describe("resetLabel", () => {
  it("formats a real period end in French", () => {
    expect(resetLabel("2026-08-01T00:00:00Z")).toBe("1 août");
  });

  it("returns null for an absent or unparseable date — the card then shows NONE", () => {
    // A free account often has no Stripe period end; inventing one would misinform the
    // user about when they can send again.
    expect(resetLabel(undefined)).toBeNull();
    expect(resetLabel("")).toBeNull();
    expect(resetLabel("pas une date")).toBeNull();
  });
});

describe("usedPct", () => {
  it("is the real consumed/allotment ratio, clamped to 0-100", () => {
    expect(usedPct({ blocked: false, allotmentCents: 200, consumedCents: 50, balanceCents: 150 })).toBe(25);
    expect(usedPct({ blocked: true, allotmentCents: 200, consumedCents: 200, balanceCents: 0 })).toBe(100);
    // Over-consumption (the metering can overshoot a concurrent burst) must not overflow the bar.
    expect(usedPct({ blocked: true, allotmentCents: 200, consumedCents: 260, balanceCents: -60 })).toBe(100);
  });

  it("reads FULL — never empty — when the allotment is unknown or zero", () => {
    // The card is on screen BECAUSE the budget is exhausted. An empty bar would tell the
    // opposite story of the sentence right above it.
    expect(usedPct(null)).toBe(100);
    expect(usedPct(undefined)).toBe(100);
    expect(usedPct({ blocked: true, allotmentCents: 0, consumedCents: 0, balanceCents: 0 })).toBe(100);
  });
});
