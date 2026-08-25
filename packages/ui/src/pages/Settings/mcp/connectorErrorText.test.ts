import { describe, expect, it } from "vitest";
import { connectorErrorText } from "./connectorErrorText";

/**
 * Journal du 15/08 : la fiche Vercel affichait « Refresh token is invalid. » — de l'anglais
 * brut, à la place de la description du service, sans dire quoi faire, sur l'écran même où
 * la réparation tient en un clic.
 */

describe("connectorErrorText — l'utilisateur lit une phrase, et le geste à faire", () => {
  it("autorisation morte, dans toutes les langues des fournisseurs → « reconnectez-vous »", () => {
    for (const m of [
      "Refresh token is invalid.",
      "invalid_grant",
      "Token has been expired or revoked.",
      "401 Unauthorized",
      "authorization required",
    ]) {
      const out = connectorErrorText(m);
      expect(out, m).not.toBeNull();
      expect(out!.reconnect, m).toBe(true);
      expect(out!.text, m).toContain("reconnectez-vous");
    }
  });

  it("distingue les gestes : une clé refusée ne se « reconnecte » pas", () => {
    const k = connectorErrorText("clé API refusée");
    expect(k?.reconnect).toBe(false);
    expect(k?.text).toContain("clé API");
    const n = connectorErrorText("fetch failed");
    expect(n?.reconnect).toBe(false);
    expect(n?.text).toContain("injoignable");
    const u = connectorErrorText("Ce serveur n'autorise pas l'inscription OAuth (dynamic client registration)");
    expect(u?.reconnect).toBe(false);
  });

  it("un 403 est un refus du service, pas une expiration — mais se re-tente après correction", () => {
    const f = connectorErrorText("403 Forbidden");
    expect(f?.text).toContain("refuse l'accès");
    expect(f?.reconnect).toBe(true);
  });

  it("INCONNU ⇒ null : on garde le message brut plutôt que d'inventer une phrase", () => {
    expect(connectorErrorText("Kaboom v2 subsystem misaligned")).toBeNull();
    expect(connectorErrorText("")).toBeNull();
    expect(connectorErrorText(undefined)).toBeNull();
  });
});
