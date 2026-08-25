// Regression pins for the 2026-07 audit batch — one test per closed hole.
import { describe, it, expect } from "vitest";
import { redact } from "./redact";
import { pseudonymize } from "../model/pseudonymize";

describe("audit: numeric MRN in pseudonymize (health ∈ numberCarriesMeaning)", () => {
  it("a numeric medical-record number is faked, not left in clear", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("Patient MRN 88213470, groupe O+.", { vault });
    expect(r.text).not.toContain("88213470");
    expect(Object.values(vault)).toContain("88213470");
  });
});

describe("audit: url-off gate never suppresses CHECKSUMMED PII inside a URL", () => {
  it("an IBAN in a query string is still redacted with the url category off", () => {
    const iban = "FR7630006000011234567890189";
    const r = redact(`virement via https://bank.example/t?iban=${iban}&x=1`, {
      disabledKinds: ["url"],
    });
    expect(r.text).not.toContain(iban);
  });

  it("a Luhn-valid card in a URL is still redacted with the url category off", () => {
    const r = redact("recu https://pay.example/cb?pan=4556737586899855 merci", {
      disabledKinds: ["url"],
    });
    expect(r.text).not.toContain("4556737586899855");
  });

  it("an asset filename inside a URL stays suppressed (the gate still works)", () => {
    const r = redact("voir https://cdn.example/img/GettyImages-1234567890.jpg", {
      disabledKinds: ["url"],
    });
    expect(r.text).toContain("GettyImages-1234567890.jpg");
  });
});

describe("audit: coverage additions", () => {
  it("AWS temporary (ASIA) keys are caught like AKIA", () => {
    const r = redact("creds: ASIAIOSFODNN7EXAMPLE et AKIAIOSFODNN7EXAMPLE");
    expect(r.text).not.toContain("ASIAIOSFODNN7EXAMPLE");
    expect(r.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("a Cardano address fires bare; a Solana address needs its context word", () => {
    const cardano = "addr1qxy2k0dq2m6h3v9w8p7r5t4u3s2a1zxcvbnmasdfghjklqwertyuiop12";
    expect(redact(`envoie à ${cardano}`).text).not.toContain(cardano);
    const sol = "4Nd1mYbJkzXfA5yZq8pW3vR7tK2cD9eH6gU1sLxQoPjB";
    expect(redact(`wallet solana : ${sol}`).text).not.toContain(sol);
    // Without the context word the CRYPTO rule stays silent (the long mixed-alnum
    // run may still be claimed by the generic token heuristic — another category).
    expect(redact(`ref interne ${sol}`).text).not.toContain("CRYPTO");
  });

  it("a 12-word BIP-39 seed phrase is redacted; ordinary prose is not", () => {
    const seed = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    expect(redact(`ma phrase : ${seed}`).text).not.toContain(seed);
    const prose = "please review the quarterly numbers before the meeting on thursday morning";
    expect(redact(prose).text).toBe(prose);
  });

  it("CAF / Pôle Emploi / INE ids fire only WITH their scheme keyword", () => {
    expect(redact("numéro allocataire CAF : 1234567").text).not.toContain("1234567");
    expect(redact("identifiant pôle emploi 12345678A dossier").text).not.toContain("12345678A");
    expect(redact("INE : 1234567890A").text).not.toContain("1234567890A");
    // The same digit runs WITHOUT a keyword stay untouched (banal shapes).
    expect(redact("commande 1234567 confirmée").text).toContain("1234567");
  });

  it("Portuguese labeled fields (endereço / telefone / cidade) are detected", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize(
      "endereço : Rua das Flores 12\ntelefone : 912 345 678\ncidade : Coimbra",
      { vault },
    );
    expect(r.text).not.toContain("Rua das Flores 12");
    expect(r.text).not.toContain("912 345 678");
    expect(r.text).not.toContain("Coimbra");
  });
});

describe("audit: precision fixes", () => {
  it("AWS_DEFAULT_REGION / *_REGION values are no longer redacted", () => {
    const r = redact("AWS_DEFAULT_REGION=eu-west-3\nAPP_SECRET=zk9x2m4qv8w1");
    expect(r.text).toContain("eu-west-3");
    expect(r.text).not.toContain("zk9x2m4qv8w1");
  });

  it("a bare Luhn-valid 11-digit run is NOT an Italian Partita IVA without context", () => {
    // 45621164032 passes the IVA Luhn but fails the German Steuer-ID checksum, so
    // it isolates the IVA rule from the other 11-digit families.
    const bare = redact("commande n° 45621164032 expédiée");
    expect(bare.text).toContain("45621164032"); // banal run, no keyword → untouched
    const gated = redact("partita iva 45621164032");
    expect(gated.text).not.toContain("45621164032");
    expect(gated.text).toContain("COMPANY_ID");
  });
});

describe("IBAN — French typographic and dotted separators", () => {
  it("redacts an IBAN grouped with no-break spaces", () => {
    const out = redact("IBAN FR76 3000 4000 0312 3456 7890 143 ok", {}).text;
    expect(out).not.toContain("3000 4000");
  });
  it("redacts a dot-separated IBAN (mod-97 still validates)", () => {
    const out = redact("IBAN FR76.3000.4000.0312.3456.7890.143 fin", {}).text;
    expect(out).not.toContain("FR76.3000");
  });
});
