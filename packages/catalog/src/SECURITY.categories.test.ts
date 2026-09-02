// `SECURITY.md` states which categories the redaction boundary covers. A DPO reads that
// paragraph to decide whether the tool may touch their data, so it is the one place where
// a stale sentence is not a documentation defect but a false assurance — a promise to
// remove health data from a build whose detector for it was withdrawn.
//
// So the paragraph is not trusted, it is DERIVED: this test reads the catalogue and fails
// when the counts it states no longer match. Retiring a category or flipping a default now
// fails CI until the prose follows, which is the only version of "keep in sync" that works.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REDACTION_CATEGORIES, CATEGORY_DEFAULTS, RETIRED_CATEGORIES } from "./redaction";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOC = readFileSync(join(REPO, "SECURITY.md"), "utf8");

const retired = new Set<string>(RETIRED_CATEGORIES);
const live = REDACTION_CATEGORIES.filter((c) => !retired.has(c.key));
const on = live.filter((c) => CATEGORY_DEFAULTS[c.key]);
const off = live.filter((c) => !CATEGORY_DEFAULTS[c.key]);

describe("SECURITY.md states the real redaction coverage", () => {
  it(`counts the on-by-default categories (${on.length})`, () => {
    expect(DOC).toContain(`**On by default (${on.length}).**`);
  });

  // The file states the same policy twice, in English then in French. A reader who only
  // has one of the two must not get the weaker version, so both halves are pinned.
  it(`states the same three counts in the French half`, () => {
    expect(DOC).toContain(`**Actives par défaut (${on.length}).**`);
    expect(DOC).toContain(`**Inactives sauf si vous les activez (${off.length}).**`);
    expect(DOC).toContain(
      `**Retirées — celles-ci ne peuvent pas être activées du tout (${retired.size}).**`,
    );
    expect(DOC).toContain("n'est PAS retiré");
  });

  it(`counts the off-by-default categories (${off.length})`, () => {
    expect(DOC).toContain(`**Off unless you turn them on (${off.length}).**`);
  });

  it(`counts the retired categories (${retired.size})`, () => {
    expect(DOC).toContain(`**Retired — these cannot be enabled at all (${retired.size}).**`);
  });

  it("names every off-by-default category, so neither hides in a count", () => {
    for (const c of off) expect(DOC.toLowerCase()).toContain(c.key.toLowerCase());
  });

  it("never promises a retired category as protected", () => {
    // The retired ones may only appear under the paragraph that says they are NOT removed.
    const idx = DOC.indexOf("**Retired — these cannot be enabled at all");
    expect(idx).toBeGreaterThan(0);
    const promised = DOC.slice(0, idx);
    for (const key of retired) expect(promised).not.toContain(`\`${key}\``);
  });

  it("keeps the warning that makes the retirement legible to an evaluator", () => {
    expect(DOC).toContain("is NOT removed");
  });
});
