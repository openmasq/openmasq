import { describe, expect, it, beforeEach } from "vitest";
import {
  classifyOutcome,
  getExchangeState,
  recordExchange,
  resetExchangeState,
  withExchangeWitness,
} from "./status";

/**
 * The sync witness: what counts as "it works". The mistake it pins down:
 * confusing "the network answers" with "sync functions" — a 403 from a revoked
 * device ANSWERS just fine, and that's a total sync failure.
 */
describe("classifyOutcome", () => {
  it("un 4xx/5xx est un ÉCHEC — 401/403/503 sont les pannes que le témoin existe pour montrer", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      const v = classifyOutcome({ ok: false, status });
      expect(v.ok, String(status)).toBe(false);
      expect(v.reason).toBe(`HTTP ${status}`);
    }
  });

  it("une panne réseau dit « serveur injoignable » — pas un code inventé", () => {
    expect(classifyOutcome({ ok: false, network: true }).reason).toBe("serveur injoignable");
  });

  it("un 2xx est un échange", () => {
    expect(classifyOutcome({ ok: true })).toEqual({ ok: true, reason: null });
  });
});

describe("withExchangeWitness — observe sans changer le contrat", () => {
  beforeEach(resetExchangeState);

  it("la réponse repart INTACTE, erreurs comprises, et l'état est nourri", async () => {
    const res403 = new Response("x", { status: 403 });
    const f = withExchangeWitness(async () => res403);
    expect(await f("https://x")).toBe(res403);
    expect(getExchangeState().lastError).toBe("HTTP 403");

    const boom = new Error("ECONNREFUSED");
    const g = withExchangeWitness(async () => {
      throw boom;
    });
    // The throw PASSES THROUGH — the caller's best-effort remains its own.
    await expect(g("https://x")).rejects.toBe(boom);
    expect(getExchangeState().lastError).toBe("serveur injoignable");
  });

  it("un succès n'efface pas l'horodatage d'échec — la phrase juge sur le plus récent", async () => {
    recordExchange(false, "HTTP 503", 1000);
    const f = withExchangeWitness(async () => new Response("ok"));
    await f("https://x");
    const s = getExchangeState();
    expect(s.lastErrorAt).toBe(1000);
    expect(s.lastOkAt).toBeGreaterThan(1000);
  });
});
