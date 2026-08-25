import { describe, it, expect } from "vitest";
import { containsCredentialShaped } from "./credScan";

/**
 * `containsCredentialShaped` is the fail-closed escalation trigger for the browser's
 * clear-mode: a page result that carries a credential-shaped span must go through the
 * FULL redaction path (an authenticated console page shows real keys). These pin both
 * directions — it must fire on a vendor-prefixed key, and it must NOT fire on ordinary
 * public-web noise (else every page escalates and the clear-mode is dead code).
 */
describe("containsCredentialShaped", () => {
  it("fires on a vendor-prefixed key visible in page text (AWS access key id)", () => {
    expect(
      containsCredentialShaped("Access key ID\nAKIAIOSFODNN7EXAMPLE\nCreated 2024-01-02"),
    ).toBe(true);
  });

  it("fires on a GitLab personal access token", () => {
    expect(containsCredentialShaped("token: glpat-aBcDeF123456789012345")).toBe(true);
  });

  it("does NOT fire on ordinary news/page text", () => {
    expect(
      containsCredentialShaped(
        "Espagne : le gouvernement annonce un plan énergie. La ministre a présenté " +
          "les mesures mardi à Madrid, devant 250 journalistes.",
      ),
    ).toBe(false);
  });

  it("does NOT fire on CDN cache-busters / asset ids (the apikey heuristic is excluded)", () => {
    expect(
      containsCredentialShaped(
        "https://cdn.example.com/GettyImages-1234567890-b3f9a2c1d4e5.jpg?v=a1b2c3d4e5f6a7b8",
      ),
    ).toBe(false);
  });

  it("is idempotent (shared regex state never leaks between calls)", () => {
    const hot = "clé : glpat-aBcDeF123456789012345";
    expect(containsCredentialShaped(hot)).toBe(true);
    expect(containsCredentialShaped(hot)).toBe(true);
    expect(containsCredentialShaped("texte parfaitement anodin")).toBe(false);
    expect(containsCredentialShaped(hot)).toBe(true);
  });
});
