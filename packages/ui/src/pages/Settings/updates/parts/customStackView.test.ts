import { describe, expect, it } from "vitest";
import { customStackRefusalKey } from "./customStackView";

describe("customStackRefusalKey — chaque refus du main a une phrase, et l'inconnu aussi", () => {
  it("un refus de VALIDATION nomme le champ fautif par sa raison", () => {
    expect(customStackRefusalKey({ ok: false, reason: "invalid", field: "backend", detail: "not_https" })).toBe("not_https");
    expect(customStackRefusalKey({ ok: false, reason: "invalid", detail: "supabase_pair" })).toBe("supabase_pair");
  });

  it("les autres refus sont leur propre raison", () => {
    expect(customStackRefusalKey({ ok: false, reason: "declined" })).toBe("declined");
    expect(customStackRefusalKey({ ok: false, reason: "write_failed" })).toBe("write_failed");
    expect(customStackRefusalKey({ ok: false, reason: "custom_not_allowed" })).toBe("custom_not_allowed");
  });

  it("l'inconnu tombe sur la phrase générique — jamais un silence, jamais une clé absente", () => {
    expect(customStackRefusalKey(null)).toBe("generic");
    expect(customStackRefusalKey(undefined)).toBe("generic");
    expect(customStackRefusalKey({ ok: false, reason: "invalid", detail: "???" })).toBe("generic");
    expect(customStackRefusalKey({ ok: true, relaunching: true })).toBe("generic");
  });
});
