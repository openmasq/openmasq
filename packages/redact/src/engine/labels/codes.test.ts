import { describe, expect, it } from "vitest";
import { detectLabeledCodes } from "./codes";
import { pseudonymize } from "../../index";

const found = (t: string) => detectLabeledCodes(t).map((d) => `${d.category}:${d.value}`);

describe("detectLabeledCodes — labelled codes without a colon", () => {
  it("customer / employee / policy ids, with the id mark, in prose", () => {
    expect(found("the customer ID CUST13588914 is on file")).toEqual(["ID:CUST13588914"]);
    expect(found("an individual with the employee ID P-468633-I")).toEqual(["ID:P-468633-I"]);
    expect(found("My employee_id is Nm-80877.")).toEqual(["ID:Nm-80877"]);
    expect(found("Kundennummer 4471-22 bitte angeben")).toEqual(["ID:4471-22"]);
  });
  it("a plain noun without the mark is never a label: a count, a year, a rule number", () => {
    expect(found("the customer 4 times, policy of 2019, case 3 of the Rules of Court")).toEqual([]);
    expect(found("customer 2024 survey")).toEqual([]);
  });
  it("court case numbers in the ECHR form, enumerations included", () => {
    expect(found("originated in an application (no. 36110/97) against Turkey")).toEqual(["ID:36110/97"]);
    expect(found("applications nos. 43185/98 and 43186/98 were joined")).toEqual(["ID:43185/98", "ID:43186/98"]);
    expect(found("case of 12/05/2024 hearing")).toEqual([]);
  });
  it("PIN, CVV and routing numbers named in prose", () => {
    expect(found("whose account pin is 182500")).toEqual(["SECRET:182500"]);
    expect(found("The CVV for this card is 570.")).toEqual(["SECRET:570"]);
    expect(found("will provide my bank routing number 611413578 later")).toEqual(["BANK_ROUTE:611413578"]);
  });
  it("identity documents, in Spanish and English", () => {
    expect(found("Número de pasaporte de la remitente: 218960794.")).toEqual(["ID:218960794"]);
    expect(found("Driver's License No.: O42-9680-311-04")).toEqual(["ID:O42-9680-311-04"]);
    expect(found("the sender's passport number (635406038)")).toEqual(["ID:635406038"]);
  });
  it("reaches the wire through the pipeline", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("My employee ID is EMP669456 and my account pin is 6296.", { vault });
    expect(r.text).not.toContain("EMP669456");
    expect(r.text).not.toContain("6296");
  });
});

describe("labelled fields — the world volume", () => {
  it("routing number, CVV, customer id, licence and card under their label, no checksum needed", async () => {
    const vault: Record<string, string> = {};
    const t = "Routing Number: 668405644 · Credit Card Security Code: 453 · Customer ID: D5175516 · Número de licencia de conducir: B98432415 · Tarjeta de crédito: 4392-7715-2262-2101 · SWIFT: BNPAFRPP";
    const r = await pseudonymize(t, { vault });
    for (const real of ["668405644", "453", "D5175516", "B98432415", "4392-7715-2262-2101", "BNPAFRPP"]) expect(r.text, real).not.toContain(real);
    // the separator stayed outside every value
    expect(Object.values(vault).some((v) => v.includes("·"))).toBe(false);
  });
});

describe("labelled fields — serialised dialects", () => {
  it("an XML element whose tag is a label, and a JSON key with an identifier suffix", async () => {
    const t = `<Person><Username>manaka</Username><Password>2P~e&gt;A</Password><postcode>79774</postcode><building>964</building></Person>
{"BuildingNumber": "441", "Telefonnummer_id": "014 759.075 1364", "Führerschein_id": "R0-FRA-72KO2443-7", "TeacherID": "89-29-11-97-M99-3"}
- Gebäudenummer: 834
- Nebenadresse: Ranch 412`;
    const vault: Record<string, string> = {};
    const r = await pseudonymize(t, { vault, disabledKinds: [] });
    for (const real of ["manaka", "2P~e&gt;A", "79774", "964", "441", "014 759.075 1364", "R0-FRA-72KO2443-7", "89-29-11-97-M99-3", "834", "Ranch 412"]) expect(r.text, real).not.toContain(real);
    // the tags themselves are never a value
    expect(r.text).toContain("<Username>");
    expect(r.text).toContain("</postcode>");
  });
  it("a tag that is not a label, or a value that is prose, stays", async () => {
    const t = `<note>Please call the office</note><status>active</status>`;
    expect((await pseudonymize(t, { disabledKinds: [] })).text).toBe(t);
  });
});

describe("detectLabeledCodes — health, licence, device, card and password, in prose", () => {
  it("a prefixed code under its compound label", () => {
    expect(found("a beneficiary under health plan beneficiary number H19385278-03, and")).toEqual(["ID:H19385278-03"]);
    expect(found("Your health plan beneficiary number is CA-9876543210. Please keep it.")).toEqual(["ID:CA-9876543210"]);
    expect(found("The certificate license number FL-78523416 was verified")).toEqual(["ID:FL-78523416"]);
    expect(found("whose medical record number is MRN-3456218, has been referred")).toEqual(["ID:MRN-3456218"]);
    expect(found("The patient's biometric identifier, BIO-4987253610, is noted")).toEqual(["ID:BIO-4987253610"]);
    expect(found("the device identifier 7F2A1E8F-9B3D-4C7E-8A4B-6C5D9E2A1F3B is valid")).toEqual(["ID:7F2A1E8F-9B3D-4C7E-8A4B-6C5D9E2A1F3B"]);
    expect(found("Número de Seguro Social: 608-32-0829")).toEqual(["ID:608-32-0829"]);
  });
  it("a label whose value is prose, a count or a year is not a code", () => {
    expect(found("the medical record number was updated in 2023")).toEqual([]);
    expect(found("a license number is required for 3 of the 4 vehicles")).toEqual([]);
  });
  it("a card named in prose, no checksum under the label", () => {
    expect(found("Must have a credit debit card, such as 4738 2956 7821 4538 |")).toEqual(["CARD:4738 2956 7821 4538"]);
    expect(found("payment on the credit/debit card number 4921 3785 1234 5678, with the CVV code 415")).toEqual(["SECRET:415", "CARD:4921 3785 1234 5678"]);
    expect(found("I used my credit debit card 3472 765089 30184 for it")).toEqual(["CARD:3472 765089 30184"]);
    expect(found("the card ending in 4916 7382 1456 9784")).toEqual([]);
    expect(found("card number 4916738214569784")).toEqual(["CARD:4916738214569784"]);
    expect(found("a card 4 of hearts, and card 2024 was the year")).toEqual([]);
  });
  it("a password after its copula, or in quotes", () => {
    expect(found("Ihr neues Passwort ist m)%l8jQz0C. Bitte notieren")).toEqual(["SECRET:m)%l8jQz0C"]);
    expect(found("simply use the password 'd5knsY6kFR*zn0HyZ@' when you book")).toEqual(["SECRET:d5knsY6kFR*zn0HyZ@"]);
    expect(found('which had a password of "m(3KSxWyz". We recommend')).toEqual(["SECRET:m(3KSxWyz"]);
    expect(found("use the following password when prompted: 4A!1D7fu#@@. This password is unique")).toEqual(["SECRET:4A!1D7fu#@@"]);
    expect(found("log in using your password, bLx*51OzQ*&@N4. Once logged in")).toEqual(["SECRET:bLx*51OzQ*&@N4"]);
    expect(found("please use the password N8$kR9mZpY5!.")).toEqual(["SECRET:N8$kR9mZpY5!"]);
    expect(found("email (a@b.c), and password (Sunflower@2025). We also")).toEqual(["SECRET:Sunflower@2025"]);
    expect(found("who will use the username syoung and password River99$ to access")).toEqual(["SECRET:River99$"]);
  });
  it("the SSN behind its parenthesised acronym, the BIC named in Swedish", () => {
    expect(found("my Social Security Number (SSN) is 463-36-4052. I reside")).toEqual(["ID:463-36-4052"]);
    expect(found("The **SSN** 415-84-6016 has been verified")).toEqual(["ID:415-84-6016"]);
    expect(found("Swift-BIC-koden för mitt bankkonto är KLXDDEJU541.")).toEqual(["BIC:KLXDDEJU541"]);
    expect(found("the BIC is BNPAFRPP and the swift code is required")).toEqual(["BIC:BNPAFRPP"]);
    expect(found("cliente ID: V849-Q3067-Ve")).toEqual(["ID:V849-Q3067-Ve"]);
  });
  it("a PIN or a PUK named in prose, however long the number is", () => {
    expect(found("Your PUK code is 482781. Please enter it.")).toEqual(["SECRET:482781"]);
    // A PIN label followed by fourteen digits is a credential with a badly chosen name,
    // not a different kind of thing — the LABEL is the gate, never the length.
    expect(found("Please use the pin 10733285336267 for online access.")).toEqual([
      "SECRET:10733285336267",
    ]);
  });
  it("a password that is a word, a sentence, a link or a username is left alone", () => {
    expect(found("the password is required and must contain 8 characters")).toEqual([]);
    expect(found("password reset link https://example.com/reset?token=abc123 expires")).toEqual([]);
    expect(found("the password for user john_doe1 was reset")).toEqual([]);
    expect(found("Password: see the attached document")).toEqual([]);
  });
});
