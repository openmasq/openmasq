import { describe, expect, it } from "vitest";
import { googleApiErrorHint, type GoogleErrorLabels } from "./googleApiError";

const L: GoogleErrorLabels = {
  api: "API Gmail",
  connector: "Gmail (lecture & envoi)",
  scope: "l'autorisation de LECTURE de vos emails",
  fallback: "Lecture Gmail impossible",
};

// The adapter throws `Upstream request failed (<status>): <REASON_CODE>` — the hint
// must key off the REASON to name the exact fix (each 40x cause differs).
describe("googleApiErrorHint", () => {
  it("API not enabled → tells the user to activate it in the Cloud console", () => {
    const hint = googleApiErrorHint(new Error("Upstream request failed (403): SERVICE_DISABLED"), L);
    expect(hint).toMatch(/n'est pas activée/i);
    expect(hint).toContain("API Gmail");
    expect(hint).not.toMatch(/reconnectez/i); // enabling ≠ reconnecting
  });

  it("accessNotConfigured is treated as API-not-enabled too", () => {
    const hint = googleApiErrorHint(new Error("Upstream request failed (403): accessNotConfigured"), L);
    expect(hint).toMatch(/n'est pas activée/i);
  });

  it("insufficient scope → tells the user to reconnect and tick the consent box", () => {
    const hint = googleApiErrorHint(
      new Error("Upstream request failed (403): ACCESS_TOKEN_SCOPE_INSUFFICIENT"),
      L,
    );
    expect(hint).toMatch(/consentement/i);
    expect(hint).toContain("Gmail (lecture & envoi)");
    expect(hint).toContain("LECTURE");
  });

  it("401 → invalid/expired token, reconnect", () => {
    const hint = googleApiErrorHint(new Error("Upstream request failed (401): UNAUTHENTICATED"), L);
    expect(hint).toMatch(/expiré ou invalide/i);
  });

  it("bare 403 with no reason → generic check-both hint (still names the API + scope)", () => {
    const hint = googleApiErrorHint(new Error("Upstream request failed (403)"), L);
    expect(hint).toContain("API Gmail");
    expect(hint).toContain("403");
  });

  it("a non-auth error falls back to the verb + message", () => {
    const hint = googleApiErrorHint(new Error("Upstream request failed (500)"), L);
    expect(hint).toContain("Lecture Gmail impossible");
    expect(hint).toContain("500");
  });
});
