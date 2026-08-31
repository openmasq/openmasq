import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// A SECOND checksum-valid vector per international scheme (rules.world.test.ts
// carries the first), algorithm-computed against the engine validators — one
// vector proves the rule exists, two pin the checksum itself (a rule regressed
// to shape-only would still pass a single lucky vector). Same marker-mode
// harness; negatives pin that a broken check digit leaves the value in CLEAR.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}

describe("Europe — second valid vector per scheme", () => {
  const cases: Array<[string, string, string?]> = [
    ["Belgium registre national", "93.02.18-123.43"],
    ["Switzerland AVS", "756.1234.1234.13"],
    ["Luxembourg matricule", "1998061234510"],
    ["Norway fødselsnummer", "24066305542"],
    ["Czechia rodné číslo", "955722/1234"],
    ["Spain NIF", "99999999R"],
    ["Spain NIE", "X1234567L"],
    ["Germany Steuer-ID", "86574408053"],
    ["UK NHS (spaced)", "401 023 2137"],
    ["Turkey Kimlik", "57441037966"],
    ["Poland PESEL", "92071542130"],
  ];
  for (const [name, value] of cases) {
    it(`redacts ${name} bare`, () => {
      expect(redacted(`Réf: ${value} fin.`, value)).toBe(true);
    });
  }

  const gated: Array<[string, string, string]> = [
    ["Netherlands BSN", "BSN : 845392864", "845392864"],
    ["Portugal NIF", "contribuinte n.º 509345115", "509345115"],
    ["Ireland PPS", "PPS no. 8433589C", "8433589C"],
    ["Austria SVNR", "SVNR 5515 041285", "5515 041285"],
    ["Greece AMKA", "AMKA: 15028401238", "15028401238"],
    ["Italy Partita IVA", "P.IVA 00743980583", "00743980583"],
  ];
  for (const [name, text, value] of gated) {
    it(`redacts ${name} (gated)`, () => {
      expect(redacted(text, value)).toBe(true);
    });
  }

  /* A German INVOICE, in its two real writings. Accountant persona run
     of 17/08 (angle M): Germany was the only country in the VAT pack with no ` ?` after its
     prefix, so the SAME VAT left in clear or redacted depending on a space; and the
     Steuernummer — which §14 UStG makes mandatory when the company has no
     USt-IdNr, hence ubiquitous among small businesses — had no rule at all. */
  it("redacts a German USt-IdNr in BOTH writings (spaced is the invoice form)", () => {
    expect(redacted("USt-IdNr.: DE123456789", "DE123456789")).toBe(true);
    expect(redacted("USt-IdNr.: DE 123456789", "DE 123456789")).toBe(true);
  });

  it("redacts a German Steuernummer, keyword-gated (both official groupings)", () => {
    expect(redacted("Steuernummer: 12/345/67890", "12/345/67890")).toBe(true);
    expect(redacted("Steuernummer 123/456/78901", "123/456/78901")).toBe(true);
    expect(redacted("St.-Nr. 12 345 67890", "12 345 67890")).toBe(true);
    // Without the label, the shape is banal (a date, a reference): the WORD carries the
    // precision, there's no national check digit to carry it instead.
    expect(redacted("Position 12/345/67890 der Liste", "12/345/67890")).toBe(false);
  });

  it("redacts the EU VAT pack — second checksummed vectors", () => {
    for (const v of ["BE0456248903", "PL5250007715", "SE556016022701", "DK 36 29 40 27", "PT509345115"]) {
      expect(redacted(`TVA ${v} facturée`, v)).toBe(true);
    }
  });

  it("redacts a Polish NIP in its NATIONAL writing (keyword-gated + mod-11)", () => {
    expect(redacted("Proszę o fakturę na NIP 1132456789.", "1132456789")).toBe(true);
    expect(redacted("Kontrahent podał NIP 526-10-40-828 do umowy.", "526-10-40-828")).toBe(true);
    // Wrong check digit → the keyword alone never grabs it.
    expect(out("faktura NIP 1132456780 wystawiona")).toContain("1132456780");
  });

  it("a broken check digit leaves the bare schemes in clear", () => {
    for (const v of ["93.02.18-123.44", "756.1234.1234.14", "1998061234610", "92071542131"]) {
      expect(out(`Réf: ${v} fin.`)).toContain(v);
    }
  });
});

describe("Americas — second valid vector per scheme", () => {
  it("redacts CPF / CNPJ / RUT / CUIT (formatted, checksummed)", () => {
    expect(redacted("doc 390.533.447-05 ok", "390.533.447-05")).toBe(true);
    expect(redacted("empresa 60.701.190/0001-04 ok", "60.701.190/0001-04")).toBe(true);
    expect(redacted("cliente 7.775.596-9 ok", "7.775.596-9")).toBe(true);
    expect(redacted("factura de 27-23456789-1 ok", "27-23456789-1")).toBe(true);
  });

  it("redacts Mexico CURP (dictionary check digit)", () => {
    expect(redacted("alta de BADD110313HCMLNS06 ok", "BADD110313HCMLNS06")).toBe(true);
  });

  it("redacts Canada SIN (dashed Luhn) and US NPI (spaced Luhn-80840)", () => {
    expect(redacted("SIN 736-574-146 filed", "736-574-146")).toBe(true);
    expect(redacted("provider 1987-654-328 billed", "1987-654-328")).toBe(true);
  });

  it("redacts US ABA routing (dashed bare; bare 9-digit gated)", () => {
    expect(redacted("wire via 0110-0001-5 today", "0110-0001-5")).toBe(true);
    expect(redacted("ABA routing 321072762 provided", "321072762")).toBe(true);
  });

  it("redacts Mexico CLABE (gated + weighted check)", () => {
    expect(redacted("CLABE 014180005012345677 registrada", "014180005012345677")).toBe(true);
  });

  it("broken check digits stay in clear", () => {
    expect(out("doc 390.533.447-06 ok")).toContain("390.533.447-06");
    expect(out("cliente 7.775.596-8 ok")).toContain("7.775.596-8");
  });
});

describe("Asia-Pacific — second valid vector per scheme", () => {
  it("redacts China resident ID and Hong Kong HKID bare", () => {
    expect(redacted("身份证 34052419800101001X 登记", "34052419800101001X")).toBe(true);
    expect(redacted("HKID Z683365(A) noted", "Z683365(A)")).toBe(true);
  });

  it("redacts Japan My Number / Israel Teudat / NZ IRD (gated + checksum)", () => {
    expect(redacted("My Number 8465 2198 7037", "8465 2198 7037")).toBe(true);
    expect(redacted("Teudat Zehut: 305109928", "305109928")).toBe(true);
    expect(redacted("IRD 10-495-008 filed", "10-495-008")).toBe(true);
  });

  it("redacts the Australian pack — second checksummed vectors", () => {
    expect(redacted("TFN 459 112 447 lodged", "459 112 447")).toBe(true);
    expect(redacted("ABN 30 012 345 623 active", "30 012 345 623")).toBe(true);
    expect(redacted("ACN 004 294 553 registered", "004 294 553")).toBe(true);
    expect(redacted("Medicare 3951 23476 1 card", "3951 23476 1")).toBe(true);
  });

  it("redacts Thailand TNIN bare (weighted mod-11)", () => {
    expect(redacted("เลขบัตร 3100502234516 ok", "3100502234516")).toBe(true);
  });
});

describe("fullwidth writings (CJK documents) + unicode e-mail", () => {
  it("redacts a FULLWIDTH card number (Luhn on the ASCII fold), leaves a non-Luhn run", () => {
    expect(redacted("カード番号：４５３９５７８７６３６２１４８６で決済", "４５３９５７８７６３６２１４８６")).toBe(true);
    expect(out("注文番号：４５３９５７８７６３６２１４８７です")).toContain("４５３９５７８７６３６２１４８７");
  });

  it("redacts an ACCENTED-local-part e-mail WHOLE (no partial anchor mid-name)", () => {
    const o = out("écrivez à rené.rebour@exemple.fr pour le dossier");
    expect(o).not.toContain("rebour@exemple.fr");
    expect(o).not.toMatch(/rené\.\[/); // the old partial redaction glued « rené. » to the marker
  });
});

describe("device / vehicle / entity — second vectors", () => {
  it("redacts an IMEI (gated + Luhn), grouped or glued", () => {
    expect(redacted("IMEI : 35-847209-461235-4", "35-847209-461235-4")).toBe(true);
    expect(redacted("IMEI 358472094612354 du téléphone", "358472094612354")).toBe(true);
  });

  it("redacts a SIM ICCID bare (89 prefix + Luhn)", () => {
    expect(redacted("SIM 8933011234567890005 activée", "8933011234567890005")).toBe(true);
  });

  it("redacts a keyword-gated EU VIN (check digit optional in the EU)", () => {
    expect(redacted("VIN WVWZZZ1JZ3W386752 du véhicule", "WVWZZZ1JZ3W386752")).toBe(true);
  });

  it("redacts a second valid LEI; a broken one stays clear", () => {
    expect(redacted("entité 724500A93HDWMKNX2872 enregistrée", "724500A93HDWMKNX2872")).toBe(true);
    expect(out("entité 724500A93HDWMKNX2873 enregistrée")).not.toContain("COMPANY_ID");
  });

  it("an IMEI-shaped run failing Luhn stays in clear even behind the keyword", () => {
    expect(out("IMEI 358472094612355 relevé")).toContain("358472094612355");
  });
});
