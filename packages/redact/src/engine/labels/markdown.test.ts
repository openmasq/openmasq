import { describe, expect, it } from "vitest";
import { detectLabeledFields } from ".";
import { pseudonymize } from "../../index";

const found = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

describe("detectLabeledFields — the markdown forms", () => {
  it("bold labels, the asterisks on either side of the colon", () => {
    expect(found("- **Fax Number:** 262-775-3247")).toEqual(["PHONE:262-775-3247"]);
    expect(found("**Medical Record Number**: 1234-56-7891")).toEqual(["ID:1234-56-7891"]);
    expect(found("- **Certificate License Number:** 23MAR26-LIC124")).toEqual(["ID:23MAR26-LIC124"]);
    expect(found("__Passport Number__: X12345678")).toEqual(["ID:X12345678"]);
    expect(found("**Credit/Debit Card:**\n5234 1267 9854 7321\n")).toEqual(["CARD:5234 1267 9854 7321"]);
  });
  it("a « number » mark after any label", () => {
    expect(found("Fax Number: 502-411-7227")).toEqual(["PHONE:502-411-7227"]);
    expect(found("Passport number: 635406038")).toEqual(["ID:635406038"]);
  });
  it("a table cell — the label in one cell, the value in the next", () => {
    expect(found("| Certificate License Number | CERT-835201 |")).toEqual(["ID:CERT-835201"]);
    expect(found("| **Fax Number**            | 503-273-7688                    |")).toEqual(["PHONE:503-273-7688"]);
    expect(found("| Health Plan Beneficiary Number | AET-7895-3214-19 |")).toEqual(["ID:AET-7895-3214-19"]);
  });
  it("a header row and a separator row offer no value", () => {
    expect(found("| Name | Phone Number |\n|---|---|")).toEqual([]);
    expect(found("| id | email | full_name | phone | created_at |")).toEqual([]);
    expect(found("| Fax Number | N/A |")).toEqual([]);
  });
  it("a markdown-escaped key in a serialised pair", () => {
    expect(found(" swift\\_bic\\_code: USDUUSKA912")).toEqual(["BIC:USDUUSKA912"]);
    expect(found('"bank\\_routing\\_number": "836991621"')).toEqual(["IBAN:836991621"]);
  });
  it("a value ends where the sentence ends, a city keeps its abbreviated saint", () => {
    expect(found("filed under the Social Security Number: 017-69-1878. The taxpayer's Tax ID is: 38-1234567.")).toEqual(["ID:017-69-1878", "ID:38-1234567"]);
    expect(found("Phone: 262-775-3247. Call after noon.")).toEqual(["PHONE:262-775-3247"]);
    expect(found("City: St. Louis")).toEqual(["CITY:St. Louis"]);
  });
  it("a placeholder is not a value, a real value in brackets still is", () => {
    expect(found("Fax Number: Not Provided")).toEqual([]);
    expect(found("Hotel Name: TBD")).toEqual([]);
    expect(found("Coverage: [Insert Coverage Limit]")).toEqual([]);
    expect(found("Email: <john@exemple.fr>")).toEqual(["EMAIL:<john@exemple.fr>"]);
    expect(found("Numéro de contrat : (2024-8891)")).toEqual(["ID:(2024-8891)"]);
  });
  it("a sentence under a NAME label is prose; a long name with particles is not", () => {
    expect(found("Skin contact: Wash off with soap and water")).toEqual([]);
    expect(found("Contact: Please call the office before noon")).toEqual([]);
    expect(found("Nom : Marie-Claire de la Tour du Pin")).toEqual(["NAME:Marie-Claire de la Tour du Pin"]);
    expect(found("Nom : REBOUR Jean Pierre Marie Joseph")).toEqual(["NAME:REBOUR Jean Pierre Marie Joseph"]);
    expect(found("Naam: van der Berg de Vries")).toEqual(["NAME:van der Berg de Vries"]);
  });
  it("reaches the wire through the pipeline", async () => {
    const t = "**Contact Information**\n\n- **Fax Number:** 914-202-9000\n- **Medical Record Number:** 8371592\n\n| Biometric Identifier | BIO-4827619530 |";
    const r = await pseudonymize(t, {});
    for (const real of ["914-202-9000", "8371592", "BIO-4827619530"]) expect(r.text, real).not.toContain(real);
    expect(r.text).toContain("**Fax Number:**");
    expect(r.text).toContain("| Biometric Identifier |");
  });
});
