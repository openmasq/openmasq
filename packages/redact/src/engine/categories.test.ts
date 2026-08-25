import { describe, it, expect } from "vitest";
import { redact, redactionCategory, type Vault } from "../index";

describe("redactionCategory (fine, toggleable categories)", () => {
  it("distinguishes the finer PII the engine detects", () => {
    expect(redactionCategory("CARD")).toBe("card");
    expect(redactionCategory("IBAN")).toBe("iban");
    expect(redactionCategory("national_id")).toBe("national_id");
    expect(redactionCategory("SSN")).toBe("national_id");
    expect(redactionCategory("ADDRESS")).toBe("address");
    expect(redactionCategory("DOB")).toBe("dob");
    expect(redactionCategory("LOCATION")).toBe("location");
    expect(redactionCategory("USERNAME")).toBe("username");
    expect(redactionCategory("handle")).toBe("username");
    expect(redactionCategory("login")).toBe("username");
  });
  it("keeps the existing coarse mappings and groups keys under secret", () => {
    expect(redactionCategory("EMAIL")).toBe("email");
    expect(redactionCategory("PHONE")).toBe("phone");
    expect(redactionCategory("ORG")).toBe("company");
    expect(redactionCategory("jwt")).toBe("secret");
    expect(redactionCategory("connection_string")).toBe("secret");
    expect(redactionCategory("api_token")).toBe("apikey");
  });
});

describe("checksum-validated detectors", () => {
  it("redacts a Luhn-valid card but not a random 16-digit number", () => {
    const valid = redact("Card 4242 4242 4242 4242 on file.", { vault: {} });
    expect(valid.text).not.toContain("4242 4242 4242 4242");
    expect(valid.matches.some((m) => m.type === "card")).toBe(true);

    const invalid = redact("Ref 1234 5678 9012 3456 today.", { vault: {} });
    expect(invalid.text).toContain("1234 5678 9012 3456"); // fails Luhn → kept
  });
  it("categorises a bare valid SIRET as company_id, not card", () => {
    // 863 471 587 00015 — a valid SIRET: the full 14 digits pass Luhn AND its embedded
    // SIREN (863 471 587) passes Luhn. That double checksum lets it fire WITHOUT a
    // keyword — a COMPANY identifier (own toggle), never redacted as a credit CARD.
    const r = redact("Fournisseur 863 471 587 00015 réglé.", { vault: {} });
    expect(r.text).not.toContain("863 471 587 00015");
    expect(r.matches.some((m) => m.type === "company_id")).toBe(true);
    expect(r.matches.some((m) => m.type === "card")).toBe(false);
  });
  it("a 14-digit Luhn card whose SIREN half fails stays a card, not a SIRET", () => {
    // 36259600000004 — a Diners test card: full-14 Luhn valid, but its first 9 are NOT
    // a Luhn-valid SIREN, so the double gate rejects it and it falls through to `card`.
    const r = redact("Paiement 36259600000004 accepté.", { vault: {} });
    expect(r.matches.some((m) => m.type === "card")).toBe(true);
    expect(r.matches.some((m) => m.type === "company_id")).toBe(false);
  });
  it("redacts a mod-97-valid IBAN but not an IBAN-shaped junk string", () => {
    const valid = redact("Wire to DE89 3704 0044 0532 0130 00 please.", { vault: {} });
    expect(valid.matches.some((m) => m.type === "iban")).toBe(true);

    const invalid = redact("Code DE00 0000 0000 0000 0000 00 here.", { vault: {} });
    expect(invalid.matches.some((m) => m.type === "iban")).toBe(false);
  });
});

describe("per-category disabling (disabledKinds = category ids)", () => {
  it("disabling 'card' keeps IBAN redaction", () => {
    const vault: Vault = {};
    const r = redact("Card 4242424242424242 and IBAN DE89370400440532013000.", {
      vault,
      disabledKinds: ["card"],
    });
    expect(r.text).toContain("4242424242424242"); // card off → in clear
    expect(r.matches.some((m) => m.type === "iban")).toBe(true); // iban still on
  });
  it("disabling 'email' still leaves other categories on", () => {
    const r = redact("Mail a@b.com, card 4242424242424242.", {
      vault: {},
      disabledKinds: ["email"],
    });
    expect(r.text).toContain("a@b.com");
    expect(r.matches.some((m) => m.type === "card")).toBe(true);
  });
});
