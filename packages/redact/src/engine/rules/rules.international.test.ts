import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// A value is "redacted" if it no longer appears verbatim in the output and a
// placeholder took its place. We drive the real engine (marker mode) so ordering
// / overlap with the built-in rules is exercised too.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_(NATIONAL_ID|COMPANY_ID|BANK_ROUTE|DOB)_\d+\]/.test(o);
}

describe("international national_id — checksum-validated schemes", () => {
  const cases: Array<[string, string]> = [
    ["Poland PESEL", "44051401458"],
    ["Spain NIF", "55555555K"],
    ["Spain NIE", "Z8078221M"],
    ["Canada SIN", "193 456 787"],
    ["US NPI (spaced)", "1234 567 893"],
    ["US ABA (bare, gated)", "routing 121000358"],
    ["US ABA (dashed)", "0711-0130-7"],
    ["UK NHS", "401-023-2137"],
    ["Turkey Kimlik", "10000000146"],
    // The IVA is now CONTEXT-GATED (audit: Luhn over 11 digits passes ~1/10 of
    // random runs — bare it redacted order ids/phones as company_id).
    ["Italy Partita IVA (gated)", "partita iva 01333550323"],
  ];
  for (const [name, value] of cases) {
    it(`redacts ${name}`, () => {
      expect(redacted(`Réf: ${value} fin.`, value)).toBe(true);
    });
  }
});

describe("international national_id — distinctive shapes", () => {
  const cases: Array<[string, string]> = [
    ["India GSTIN", "27ABCDE1234F1Z5"],
    ["Singapore NRIC/FIN", "S2740116C"],
    ["Germany VAT", "DE123456789"],
  ];
  for (const [name, value] of cases) {
    it(`redacts ${name}`, () => {
      expect(redacted(`ID ${value} ok`, value)).toBe(true);
    });
  }
});

describe("international national_id — context-gated bare numerics", () => {
  it("redacts an Australian ABN only WITH context", () => {
    expect(redacted("ABN 51 824 753 556", "51 824 753 556")).toBe(true);
    // same digits without the context word are left alone
    expect(out("total 51 824 753 556 items")).toContain("51 824 753 556");
  });
  it("redacts an Aadhaar (bare or spaced) only WITH context", () => {
    expect(redacted("Aadhaar 123456789012", "123456789012")).toBe(true);
    expect(redacted("Aadhaar 1234 5678 9012", "1234 5678 9012")).toBe(true);
    expect(out("count 123456789012 rows")).toContain("123456789012");
    expect(out("card 1234 5678 9012 3456")).toContain("1234 5678 9012");
  });
  it("redacts a US bank account only WITH context", () => {
    expect(redacted("bank account 823456781234", "823456781234")).toBe(true);
    expect(out("sku 823456781234 x")).toContain("823456781234");
  });
  // Generic letter/digit ID shapes that USED to fire bare (a flood of FPs on order
  // numbers / SKUs / codes) are now context-gated: they redact only WITH a scheme
  // keyword, and pass through in clear otherwise.
  it("redacts generic-shape national IDs only WITH context", () => {
    // India PAN — bare `ABCDE1234F` no longer redacts; only with "PAN" context.
    expect(redacted("PAN ABCDE1234F", "ABCDE1234F")).toBe(true);
    expect(out("ID ABCDE1234F ok")).toContain("ABCDE1234F");
    // Korea RRN — dashed 13-digit only with "RRN" context.
    expect(redacted("RRN 900101-1234567", "900101-1234567")).toBe(true);
    expect(out("ref 900101-1234567 x")).toContain("900101-1234567");
    // Nigeria vehicle plate — only with a plate/vehicle context word.
    expect(redacted("plate ABC 123XY", "ABC 123XY")).toBe(true);
    expect(out("code ABC 123XY x")).toContain("ABC 123XY");
  });
  // Regression for the FP flood the review found: bare generic shapes that must NOT
  // redact on their own (order refs, SKUs, dashed groups, ALLCAPS-word+digits).
  it("does NOT redact ordinary codes that only LOOK like national IDs", () => {
    for (const s of [
      "Order R00123456 shipped", // US passport letter+8 digits
      "ref 12345678A here", // Singapore UEN 8-digit+capital
      "phone 123-45-67890 ext", // Korea BRN 3-2-5 dashed
      "code AB1234567 ok", // IT/generic 2-letter+7-digit
      "hello2024a and since2020s", // India PAN case-insensitive word
      "num 123456-7890 x", // Finland hetu 6-dash-4
    ]) {
      expect(out(s)).not.toMatch(/\[REDACTED_NATIONAL_ID_\d+\]/);
    }
  });
  it("leaves a BARE 10-digit run (Unix timestamp) in clear unless NHS-shaped/contextual", () => {
    // A Stripe `created` timestamp is a bare 10-digit run — it must NOT redact (it
    // corrupted the model's date math, irreversibly). Regression for the over-broad
    // NHS rule (optional separators matched any 10 digits).
    expect(out('{"created":2520525167}')).toContain("2520525167");
    // a real NHS number STILL redacts in the spaced/dashed form (checksum-valid)…
    expect(redacted("Réf: 401-023-2137 fin.", "401-023-2137")).toBe(true);
    // …and bare WITH context (same digits, no separators, checksum-valid).
    expect(redacted("NHS number 4010232137", "4010232137")).toBe(true);
  });
});

describe("context-gated DOB", () => {
  it("redacts a birth date (FR / EN / ISO)", () => {
    expect(redacted("Né le 12/03/1990.", "12/03/1990")).toBe(true);
    expect(redacted("born on 1990-03-12", "1990-03-12")).toBe(true);
    expect(redacted("date de naissance : 03.12.1990", "03.12.1990")).toBe(true);
  });
  it("leaves a non-birth date in clear", () => {
    expect(out("Réunion le 12/03/1990 à 9h")).toContain("12/03/1990");
    expect(out("deployed 2024-01-15")).toContain("2024-01-15");
  });
});

describe("no over-redaction — ordinary numbers pass through", () => {
  it("does not touch counts, order ids, short numbers, ISO timestamps", () => {
    const text =
      "Commande 12345678 expédiée, facture 850000, ref 12345, appel 5551234, " +
      "quantité 9 unités, total 42, horodatage 2024-01-15T10:30:00Z.";
    const o = out(text);
    expect(o).not.toMatch(/\[REDACTED_NATIONAL_ID_\d+\]/);
    expect(o).not.toMatch(/\[REDACTED_DOB_\d+\]/);
  });
});

describe("gate() — accented context words actually fire (latent \\b bug)", () => {
  it("redacts an Italian identity-card number after the ACCENTED label", () => {
    // JS \b is ASCII-only: `identità\b` never matched, so this gate was dead until
    // gate() dropped its trailing \b (the separator class already bounds the word).
    expect(redacted("carta d'identità AB1234567 rilasciata", "AB1234567")).toBe(true);
  });

  it("a longer word cannot chain into a gate (no trailing-boundary regression)", () => {
    // "picnic" must not gate via its "cni"-like suffix; leading \b blocks mid-word,
    // and a letter after the word breaks the separator/core chain.
    expect(out("picnic 123456789012 personnes")).toContain("123456789012");
  });
});

describe("Espagne — NUSS / número de afiliación a la Seguridad Social", () => {
  // L'équivalent du NIR français, sur chaque bulletin de paie espagnol. Aucune règle ne le
  // voyait : il partait en clair sous son propre libellé, y compris dans une nómina servie
  // en colonnes annotées (le chemin des tableurs de l'app).
  const NUSS = "28 1234567 75";
  it("redacted les écritures qu'une nómina porte", () => {
    for (const t of [
      "Nº Seguridad Social: 28 1234567 75",
      "Numero de afiliacion a la Seguridad Social 28/01234567/75",
      "NUSS 280123456775",
      "número de la seguridad social 28-1234567-75",
    ]) {
      const o = redact(t, {}).text;
      expect(o).toMatch(/\[REDACTED_NATIONAL_ID_\d+\]/);
      expect(o).not.toMatch(/\d{2}[ /.-]?\d{7}/);
    }
  });

  /* L'ABRÉVIATION est ce qu'un imprimé porte réellement — le libellé en toutes lettres est
     l'exception. Trouvé au parcours RH (contrat espagnol, 17/08) : la garde posée le matin
     même ne couvrait donc que la moitié des documents où ce numéro apparaît. */
  it("redacted aussi sous son ABRÉVIATION (N.A.F.), celle des imprimés", () => {
    for (const t of ["N.A.F.: 28 1234567 75", "NAF 28 1234567 75", "N.A.F. 280123456775"]) {
      expect(redact(t, {}).text).toMatch(/\[REDACTED_NATIONAL_ID_\d+\]/);
    }
  });

  it("reste GARDÉ — sans le mot du schéma, une suite de chiffres banale n'est pas un NUSS", () => {
    expect(redact(`Factura ${NUSS} emitida`, {}).text).toContain(NUSS);
    expect(redact("La seguridad social espanola cubre la baja.", {}).text)
      .toContain("La seguridad social espanola cubre la baja.");
    // Le « code NAF » FRANÇAIS n'est pas concerné : 4 chiffres + une lettre ne peuvent pas
    // satisfaire les 11-12 chiffres du NUSS. Épinglé pour que l'abréviation reste sûre.
    expect(redact("Code NAF : 6201Z, effectif 12 salariés.", {}).text).toContain("6201Z");
  });
});
