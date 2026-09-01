import { describe, it, expect } from "vitest";
import { DEAD_TRANSPORT_MESSAGES, isDeadTransport } from "@openmasq/mcp";
import { isOperationalError } from "@openmasq/analytics";

/**
 * PARITY — "this MCP transport is dead" must mean the same thing on both sides.
 *
 * Two decisions depend on the same fact, and they cannot share a module:
 *  • `@openmasq/mcp` `isDeadTransport` — the owner EVICTS the connector
 *    (`apps/desktop` `refreshRoutes`) instead of continuing to probe it;
 *  • `@openmasq/analytics` `isOperationalError` — the error channels (PostHog
 *    `$exception` AND, since 12/08, Sentry's `beforeSend`) DO NOT REPORT.
 *
 * `@openmasq/analytics` is DEPENDENCY-FREE by contract: it cannot import
 * `@openmasq/mcp`. The two lists therefore live separately, and this test is what holds
 * them together — a comment cannot fail in CI (rule 9). It lives in `packages/ui`
 * because that is the only package that consumes BOTH.
 *
 * What a disagreement would cost, in both directions: a message evicted but not filtered
 * re-fills the dashboard (the 12/08 state: 93% of volume); a message filtered but
 * not evicted makes the outage INVISIBLE, since nothing reports it AND nothing removes it anymore.
 */
describe("parité mcp ⇄ analytics — les messages de transport mort", () => {
  it("chaque message que mcp reconnaît est écarté par le filtre des canaux d'erreurs", () => {
    for (const msg of DEAD_TRANSPORT_MESSAGES) {
      expect(isDeadTransport(new Error(msg))).toBe(true);
      expect(
        isOperationalError({ scope: "mcp", code: "list-tools", message: msg }),
        `« ${msg} » évince côté mcp mais serait RAPPORTÉ — le tableau de bord se remplit`,
      ).toBe(true);
    }
  });

  it("les formes RÉELLES vues sur Sentry sont couvertes des deux côtés", () => {
    // Copied from issues ELECTRON-1 and ELECTRON-2: these are the SDK's exact texts,
    // not our own, which is why they are pinned rather than paraphrased.
    for (const real of ["Not connected", "MCP error -32000: Connection closed"]) {
      expect(isDeadTransport(new Error(real))).toBe(true);
      expect(isOperationalError({ scope: "mcp", code: "list-tools", message: real })).toBe(true);
    }
  });

  it("une régression d'EMPAQUETAGE n'est ni évincée ni filtrée — c'est le signal à garder", () => {
    for (const real of ["spawn npx ENOENT", "Cannot find module 'entities/decode'"]) {
      expect(isDeadTransport(new Error(real))).toBe(false);
      expect(isOperationalError({ scope: "mcp", code: "list-tools", message: real })).toBe(false);
    }
  });
});
