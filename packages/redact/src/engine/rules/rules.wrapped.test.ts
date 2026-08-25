import { describe, expect, it } from "vitest";
import { redact, pseudonymize, unredact } from "../../index";
import { maxOneWrap } from "./rules.international.util";

// A value HARD-WRAPPED in its middle (email/terminal paste at 72-80 cols, a narrow
// PDF column) used to pass in CLEAR: the spaced schemes' separator classes had no
// newline. These pin the WRAP fix — one mid-value line break is tolerated, capped
// at ONE (`maxOneWrap`) so a vertical COLUMN of unrelated numbers is never fused
// into a checksum-blessed "value".
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, mustNotSurvive: string): boolean {
  const o = out(text);
  return !o.includes(mustNotSurvive) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}

describe("wrapped spaced values — one mid-value line break is redacted (the leak class)", () => {
  it("IBAN wrapped mid-number", () => {
    expect(redacted("IBAN : FR14 2004 1010\n0505 0001 3M02 606 fin.", "0505 0001 3M02 606")).toBe(true);
  });

  it("NIR (sécu) wrapped mid-number", () => {
    expect(redacted("sécu 1 84 03 75\n120 005 12 fin.", "120 005 12")).toBe(true);
  });

  it("card wrapped mid-number — \\n and \\r\\n", () => {
    expect(redacted("CB 4532 0151 1283\n0366 fin.", "4532 0151 1283")).toBe(true);
    expect(redacted("CB 4532 0151 1283\r\n0366 fin.", "4532 0151 1283")).toBe(true);
  });

  it("SIREN (keyword-gated) wrapped mid-number", () => {
    expect(redacted("SIREN 552 100\n554 fin.", "552 100")).toBe(true);
  });

  it("bare SIRET (double-Luhn) wrapped mid-number", () => {
    expect(redacted("immatriculée 775 384 225\n00005 au registre.", "775 384 225")).toBe(true);
  });

  it("PDF-grid wrap: the continuation line is INDENTED to its column", () => {
    expect(
      redacted("IBAN FR14 2004 1010\n        0505 0001 3M02 606 fin.", "3M02 606"),
    ).toBe(true);
  });

  it("the vault value is the VERBATIM wrapped span (newline included) — reversible with no normalisation", () => {
    const { text, matches } = redact("IBAN : FR14 2004 1010\n0505 0001 3M02 606 fin.", {});
    const m = matches.find((x) => x.placeholder.includes("IBAN"));
    expect(m?.value).toBe("FR14 2004 1010\n0505 0001 3M02 606");
    expect(text).not.toContain("2004 1010");
  });
});

describe("FP guards — no degradation of the existing behaviour", () => {
  it("NEVER fuses a 3-line column of digit groups (2 newlines), even when the fusion is Luhn-valid", () => {
    // The same Luhn-valid card split over THREE lines: a real wrap breaks once;
    // two breaks is the signature of a table column → must stay in clear.
    const o = out("montants\n4532 0151\n1283\n0366\nfin");
    expect(o).toContain("4532 0151");
    expect(o).toContain("0366");
  });

  it("does not fuse two vertically adjacent digit groups whose fusion fails the checksum", () => {
    const o = out("réf 1234 5678\n9012 3456 fin");
    expect(o).toContain("1234 5678");
    expect(o).toContain("9012 3456");
  });

  it("same-line spaced forms are untouched by the change", () => {
    expect(redacted("IBAN FR14 2004 1010 0505 0001 3M02 606 ok", "3M02 606")).toBe(true);
    expect(redacted("CB 4485 1923 7046 1239 ok", "4532 0151")).toBe(true);
    expect(redacted("SIREN 775 384 225 ok", "775 384 225")).toBe(true);
  });

  it("a bare 13-digit run still isn't a NIR (epoch-ms collision guard intact)", () => {
    expect(out('{"created": 1650318742596}')).toContain("1650318742596");
  });

  it("maxOneWrap — the cap itself", () => {
    expect(maxOneWrap("no wrap")).toBe(true);
    expect(maxOneWrap("one\nwrap")).toBe(true);
    expect(maxOneWrap("two\nwraps\nhere")).toBe(false);
  });
});

describe("wrapped values through pseudonymize — the fake is single-line, the real stays verbatim", () => {
  it("mints a fake WITHOUT a newline (a model normalises line breaks when echoing) and reverses to the wrapped real", async () => {
    const vault: Record<string, string> = {};
    const real = "FR14 2004 1010\n0505 0001 3M02 606";
    const { text } = await pseudonymize(`IBAN : ${real} fin.`, { vault });
    expect(text).not.toContain("0505 0001");
    const fake = Object.keys(vault).find((f) => vault[f] === real);
    expect(fake).toBeDefined();
    expect(fake!).not.toContain("\n"); // the fake's layout is flattened
    // The reply echoes the fake → un-redaction restores the WRAPPED real verbatim.
    expect(unredact(`Votre IBAN est ${fake}`, vault)).toBe(`Votre IBAN est ${real}`);
  });

  it("the SAME number wrapped AND unwrapped in one text: both spellings are redacted and both reverse", async () => {
    const vault: Record<string, string> = {};
    const wrapped = "4532 0151 1283\n0366";
    const flat = "4485 1923 7046 1239";
    const { text } = await pseudonymize(`carte ${flat} puis ${wrapped} fin.`, { vault });
    expect(text).not.toContain("4532 0151");
    // Every vaulted real is recoverable — no spelling was clobbered out of the vault.
    expect(Object.values(vault)).toContain(flat);
    expect(Object.values(vault)).toContain(wrapped);
  });
});
