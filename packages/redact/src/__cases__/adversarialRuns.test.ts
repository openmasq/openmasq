import { describe, expect, it } from "vitest";
import { detectEmailSpans } from "../engine/urls";
import { detectIdentityDocFields } from "../engine/persons/identityDocs";
import { detectContractNumbers } from "../engine/labels/numbers";
import { detectLabeledCodes } from "../engine/labels/codes";
import { detectAddresses } from "../engine/addresses";
import { isCodeReference } from "../engine/validators/validators.config";

/**
 * A pasted document or a tool result can hold a LONG RUN of one character class — a base64
 * blob, a hex dump, a column of tabs, a row of dots. A detector whose regex backtracks over
 * such a run costs the square of its length (measured before the fix: 30k characters took
 * 4.9 s in the e-mail scan alone), and since the send fails closed, a hung detector is a
 * blocked send. Each input below is the run that hurt that detector; the bound is loose on
 * purpose (a slow CI runner never trips it, a return of the quadratic shape always does).
 */
const N = 50_000;
const BOUND_MS = 1_000;

function timed(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("detectors stay linear on long runs", () => {
  const cases: [string, () => unknown][] = [
    ["e-mail scan, a local-part run with no @ match", () => detectEmailSpans(`${"a".repeat(N)} x@`)],
    ["identity-document header, a whitespace run", () => detectIdentityDocFields(`CARTE NATIONALE D${"\t".repeat(N)}x`)],
    ["contract number, a separator run after the label", () => detectContractNumbers(`numero client${"\t".repeat(N)}x`)],
    ["contract number, a dot run in the digits", () => detectContractNumbers(`numero client 1234${".".repeat(N)}x`)],
    ["password value, a punctuation run", () => detectLabeledCodes(`password: a1${",".repeat(N)}`)],
    ["address span, a separator run", () => detectAddresses(`12 rue de la Paix${", ".repeat(N / 2)}x`)],
    ["code reference, a camelCase-looking run", () => isCodeReference(`${"a".repeat(N)}(`)],
    ["code reference, whitespace around nothing", () => isCodeReference(`a${" ".repeat(N)}b`)],
  ];
  for (const [name, fn] of cases) {
    it(name, () => {
      expect(timed(fn)).toBeLessThan(BOUND_MS);
    });
  }
});
