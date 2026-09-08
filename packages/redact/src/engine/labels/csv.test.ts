import { describe, expect, it } from "vitest";
import { detectCsvBlocks } from "./csv";
import { pseudonymize } from "../../index";

const found = (t: string) => detectCsvBlocks(t).map((d) => `${d.category}:${d.value}`).sort();

describe("detectCsvBlocks — a CSV pasted as text", () => {
  it("types every cell by its column header, quotes stripped", () => {
    const t = `"name","ssn","street_address"\n"Giada M. Giannuzzi","271-75-7823","12 Riley Overpass, Apt. 4"`;
    expect(found(t)).toEqual(["ADDRESS:12 Riley Overpass, Apt. 4", "ID:271-75-7823", "NAME:Giada M. Giannuzzi"]);
  });
  it("markdown-escaped and underscored headers, a semicolon, several rows", () => {
    const t = `employee\\_id;bank\\_routing\\_number;password\nBb-46041;836991621;)2B+Fr$o^\nEMP371492;822883852;Zt7!kq2p`;
    expect(found(t)).toEqual(["IBAN:822883852", "IBAN:836991621", "ID:Bb-46041", "ID:EMP371492", "SECRET:)2B+Fr$o^", "SECRET:Zt7!kq2p"]);
  });
  it("a header with fewer than two labels, or a lone header line, is prose", () => {
    expect(found("apples, pears, plums\n3, 4, 5")).toEqual([]);
    expect(found(`"name","ssn"`)).toEqual([]);
    expect(found("Dear Sir, we met on Monday, and I liked it.\nBest, John")).toEqual([]);
  });
  it("reaches the wire through the pipeline", async () => {
    const t = `Here is the export:\n"name","ssn","password"\n"Giada M. Giannuzzi","271-75-7823","m(3KSxWyz"\n\nThanks`;
    const r = await pseudonymize(t, {});
    for (const real of ["Giada M. Giannuzzi", "271-75-7823", "m(3KSxWyz"]) expect(r.text, real).not.toContain(real);
    expect(r.text).toContain(`"name","ssn","password"`);
  });
});
