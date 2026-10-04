import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";

/** US immigration / military / Medicaid numbers, the spaced New York licence, the spaced
 *  German pension number — each gated on its words or, for USCIS, its distinctive shape. */
describe("US and international identifiers", () => {
  const out = async (t: string) => (await pseudonymize(t, { vault: {}, numbers: false })).text;

  it.each([
    ["Sozialversicherungsnummer 65 170839 J 003", "65 170839 J 003"],
    ["NY driver license 123 456 789", "123 456 789"],
    ["USCIS receipt number EAC2190012345", "EAC2190012345"],
    ["Green card number EAC1234567890", "EAC1234567890"],
    ["Alien Registration Number: A123456789", "A123456789"],
    ["I-94 number 69518438251", "69518438251"],
    ["Visa control number 20230123456789", "20230123456789"],
    ["DoD ID number 1234567890", "1234567890"],
    ["Medicaid ID: 12345678901", "12345678901"],
  ])("%s", async (text, value) => {
    expect(await out(text)).not.toContain(value);
  });

  it.each([
    "Sozialversicherungsnummer 65 170839 J 004", // wrong check digit
    "Medicaid expansion covered 2024 adults",
    "The DoD ID policy changed in 2019.",
    "A-number of reasons",
    "EAC12345 build",
  ])("leaves %s alone", async (text) => {
    expect(await out(text)).toBe(text);
  });
});
