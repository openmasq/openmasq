import { describe, it, expect } from "vitest";
import { realLinkHref } from "./linkHref";

// Vault maps placeholder(fake) → original(real), as persisted per conversation.
const vault = { "Brentley System": "atelierverrier" };

describe("realLinkHref", () => {
  it("restores a fake whose SPACE is %20-encoded in the href (the reported bug)", () => {
    const href =
      "https://project-rw3dz-ifo0f7xzq-Brentley%20System-8479s-projects.vercel.app";
    expect(realLinkHref(href, vault)).toBe(
      "https://project-rw3dz-ifo0f7xzq-atelierverrier-8479s-projects.vercel.app",
    );
  });

  it("restores the `+`-encoded space form too", () => {
    const href = "https://x.dev/?q=Brentley+System";
    expect(realLinkHref(href, vault)).toBe("https://x.dev/?q=atelierverrier");
  });

  it("restores a plain (unencoded) occurrence as well", () => {
    // A fake already un-redacted at the content level stays real (idempotent).
    expect(realLinkHref("https://x.dev/atelierverrier", vault)).toBe(
      "https://x.dev/atelierverrier",
    );
  });

  it("is a no-op with no vault / no href", () => {
    expect(realLinkHref("https://x.dev/Brentley%20System", {})).toBe(
      "https://x.dev/Brentley%20System",
    );
    expect(realLinkHref(undefined, vault)).toBeUndefined();
  });
});
