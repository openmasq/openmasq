import { describe, expect, it } from "vitest";
import { adminConsentUrl, microsoftAuthFailure, needsAdminConsent } from "./microsoftConsent";

const CTX = { clientId: "cid-123", redirectUri: "http://127.0.0.1:51234/cb" };

describe("microsoftConsent — un refus de locataire mène à UNE action", () => {
  it("reconnaît les refus qu'un utilisateur ne peut pas lever seul", () => {
    // These are the two codes Microsoft returns when approval depends on an
    // administrator; they share the same remedy, hence the same branch.
    expect(needsAdminConsent("access_denied — AADSTS90094: The grant requires admin permission")).toBe(true);
    expect(needsAdminConsent("AADSTS65001: The user or administrator has not consented")).toBe(true);
    expect(needsAdminConsent("consent_required")).toBe(true);
  });

  it("n'attrape pas un refus ORDINAIRE — sinon le message mentirait", () => {
    // A user who closes the window, or has a password rejected, doesn't need
    // their administrator: telling them otherwise sends them to bother someone for nothing.
    expect(needsAdminConsent("access_denied — AADSTS65004: User declined to consent")).toBe(false);
    expect(needsAdminConsent("invalid_client")).toBe(false);
    expect(needsAdminConsent(undefined)).toBe(false);
    expect(needsAdminConsent("")).toBe(false);
  });

  it("le lien d'approbation vise « organizations », jamais un locataire deviné", () => {
    // The refusal can arrive before any account is resolved: we don't know the
    // tenant, and it's the administrator's sign-in that determines it.
    const u = new URL(adminConsentUrl(CTX.clientId, CTX.redirectUri));
    expect(u.pathname).toContain("/organizations/");
    expect(u.pathname).toContain("adminconsent");
    expect(u.searchParams.get("client_id")).toBe("cid-123");
    expect(u.searchParams.get("redirect_uri")).toBe(CTX.redirectUri);
  });

  it("le message dit le REMÈDE et sa portée, sans accuser l'utilisateur", () => {
    const f = microsoftAuthFailure("AADSTS90094: The grant requires admin permission", CTX);
    expect(f.adminConsentUrl).toBeTruthy();
    expect(f.message).toMatch(/administrateur/i);
    expect(f.message).toMatch(/une seule|un clic/i);
    expect(f.message).not.toMatch(/erreur|échec|impossible/i);
  });

  it("un autre échec garde le texte du fournisseur — c'est ce qui aide au support", () => {
    const f = microsoftAuthFailure("invalid_client", CTX);
    expect(f.adminConsentUrl).toBeUndefined();
    expect(f.message).toContain("invalid_client");
  });
});
