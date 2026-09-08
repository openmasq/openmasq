import { describe, expect, it } from "vitest";
import { detectPhones } from ".";
import { pseudonymize } from "../../index";

const found = (t: string) => detectPhones(t).map((p) => p.value);

describe("detectPhones — the North American national form, in prose", () => {
  it("a punctuated 3-3-4 number after a phone word in the same sentence", () => {
    expect(found("You can reach us by phone at 724-755-8672 or by e-mail.")).toEqual(["724-755-8672"]);
    expect(found("please call (740) 726-0548 before noon")).toEqual(["(740) 726-0548"]);
    expect(found("contact us at 256.270.8035 for details")).toEqual(["256.270.8035"]);
    expect(found("I can be reached at 813-785-8183 for any further information")).toEqual(["813-785-8183"]);
    expect(found("please contact us at kristindiaz54@gmail.com and 212-515-8332.")).toEqual(["212-515-8332"]);
  });
  it("no phone word, no number: an order reference keeps its shape", () => {
    expect(found("order 724-755-8672 shipped yesterday")).toEqual([]);
    expect(found("Phone.\n\nRef 724-755-8672")).toEqual([]);
  });
  it("a shape libphonenumber refuses — a 1xx area code, an N11 exchange — is not a number", () => {
    expect(found("call 123-456-7890 now")).toEqual([]);
    expect(found("call 502-411-7227 now")).toEqual([]);
  });
  it("a longer run, a date, a glued letter: not this form", () => {
    expect(found("call 724-755-8672-1234")).toEqual([]);
    expect(found("phone log 2024-755-8672")).toEqual([]);
    expect(found("call x724-755-8672")).toEqual([]);
  });
  it("reaches the wire through the pipeline", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("For assistance, employees can call 572-220-2366.", { vault });
    expect(r.text).not.toContain("572-220-2366");
    expect(vault[Object.keys(vault).find((k) => vault[k] === "572-220-2366") ?? ""]).toBe("572-220-2366");
  });
});

describe("detectPhones — the other national forms, named as phone numbers", () => {
  it("a trunk zero or a parenthesised area code, validated for some country", () => {
    expect(found("Please contact me at (02) 8765 3421 or via email")).toEqual(["(02) 8765 3421"]);
    expect(found("can be reached by phone at 054 987 56 34.")).toEqual(["054 987 56 34"]);
    expect(found("My phone number is 0301 564 9382 and my email")).toEqual(["0301 564 9382"]);
    expect(found("Telefonnummer: call 0653-03345292 today")).toEqual(["0653-03345292"]);
  });
  it("the same digits with no phone word, or a shape no country dials, stay", () => {
    expect(found("order 0301 564 9382 shipped")).toEqual([]);
    expect(found("call 0000 000 0000 now")).toEqual([]);
    expect(found("phone bill of 012 34")).toEqual([]);
  });
});
