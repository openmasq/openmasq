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
