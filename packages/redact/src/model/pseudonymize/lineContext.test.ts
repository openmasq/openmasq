import { describe, expect, it } from "vitest";
import { dropLineNoise, isHeadingLine } from "./lineContext";
import { pseudonymize } from "../../index";

const keep = (value: string, category: string, input: string) =>
  dropLineNoise([{ value, category }], input).length === 1;

describe("dropLineNoise — a heading is not an organisation", () => {
  it("recognises the heading forms, and not a line that carries a value", () => {
    expect(isHeadingLine("### Loan")).toBe(true);
    expect(isHeadingLine("**Loan Details**")).toBe(true);
    expect(isHeadingLine("V. Endorsements")).toBe(true);
    expect(isHeadingLine("1. Social Security Number (SSN) 054-24-0990")).toBe(false);
    expect(isHeadingLine("VILLENEUVE")).toBe(false);
    expect(isHeadingLine("- **Fax Number:** 262-775-3247")).toBe(false);
  });
  it("drops an entity whose every occurrence is a heading, keeps one named in the body", () => {
    expect(keep("Loan Details", "ORG", "**Loan Details**\n- Amount: 5000")).toBe(false);
    expect(keep("Loan", "ORG", "### Loan\n\nThe loan is granted by Loan Corp.")).toBe(true);
    expect(keep("Acme Bank", "ORG", "## Acme Bank\n\nAcme Bank grants the loan.")).toBe(true);
  });
  it("drops a high-entropy token at the head of a SWIFT field, never an IBAN there", () => {
    const swift = ":20:OTCUS33GXXX0560000012\n:25:LURK0883984176\n:32A:150523CAD1234567890ABCDEFGHIJ";
    expect(keep("OTCUS33GXXX0560000012", "TOKEN", swift)).toBe(false);
    expect(keep("150523CAD1234567890ABCDEFGHIJ", "TOKEN", swift)).toBe(false);
    expect(keep("LURK0883984176", "IBAN", swift)).toBe(true);
    expect(keep("OTCUS33GXXX0560000012", "TOKEN", "key OTCUS33GXXX0560000012\n" + swift)).toBe(true);
  });
  it("keeps what sits DEEPER in the payload — that is where the people are", () => {
    const line = ":70:/NST/STANLEY JAMES-MARSH/SE/QH56771472";
    expect(keep("QH56771472", "TOKEN", line)).toBe(true);
    expect(keep("STANLEY JAMES-MARSH", "NAME", line)).toBe(true);
  });
  it("a forced value is never dropped", () => {
    expect(dropLineNoise([{ value: "Loan Details", category: "ORG", forced: true }], "**Loan Details**").length).toBe(1);
  });
  it("reaches the wire through the pipeline", async () => {
    const t = "**Loan Details**\n\n:20:OTCUS33GXXX0560000012USD5238434\n:50K:/FR7630006000011234567890189";
    const r = await pseudonymize(t, {});
    expect(r.text).toContain("**Loan Details**");
    expect(r.text).toContain("OTCUS33GXXX0560000012USD5238434");
    expect(r.text).not.toContain("FR7630006000011234567890189");
  });
});
