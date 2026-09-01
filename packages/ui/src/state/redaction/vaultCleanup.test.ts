import { BRAND } from "@openmasq/branding";
import { describe, it, expect } from "vitest";
import { cleanVaultPollution } from "./vaultCleanup";
import type { Conversation } from "../../types";

const conv = (over: Partial<Conversation>): Conversation =>
  ({ id: "c1", title: "", messages: [], ...over }) as Conversation;

describe("cleanVaultPollution", () => {
  it("removes framework-token entries but keeps real PII (vault + kinds)", () => {
    const c = conv({
      redactionVault: {
        XULmz: "scipy",
        MlCZYn: "linalg",
        PATHfake: `/Applications/${BRAND.name}.app/Contents/Resources/python-runtime/x/scipy/__init__.py`,
        Gustave: "Julien", // a REAL redaction — must survive
        Fake2: "jean@example.com", // real — must survive
      },
      redactionKinds: {
        scipy: "company",
        linalg: "secret",
        [`/Applications/${BRAND.name}.app/Contents/Resources/python-runtime/x/scipy/__init__.py`]: "path",
        Julien: "name",
        "jean@example.com": "email",
      },
    });
    const [out] = cleanVaultPollution([c]);
    // framework junk gone
    expect(Object.values(out.redactionVault!)).not.toContain("scipy");
    expect(Object.values(out.redactionVault!)).not.toContain("linalg");
    expect(out.redactionVault!.PATHfake).toBeUndefined();
    expect(out.redactionKinds!["scipy"]).toBeUndefined();
    // real PII preserved
    expect(out.redactionVault!.Gustave).toBe("Julien");
    expect(out.redactionVault!.Fake2).toBe("jean@example.com");
    expect(out.redactionKinds!["Julien"]).toBe("name");
  });

  it("is idempotent — a clean conversation is returned BY REFERENCE (no churn)", () => {
    const c = conv({
      redactionVault: { Gustave: "Julien" },
      redactionKinds: { Julien: "name" },
    });
    const [out] = cleanVaultPollution([c]);
    expect(out).toBe(c); // same ref → no re-render, effectively one-shot
  });

  it("no vault ⇒ untouched", () => {
    const c = conv({});
    expect(cleanVaultPollution([c])[0]).toBe(c);
  });
});
