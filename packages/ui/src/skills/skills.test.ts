import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import {
  SKILL_CATEGORIES,
  skillCategory,
  skillCounts,
  filterSkills,
  makeSkill,
  pinnedSkills,
  restoreSkillList,
} from "./skills";
import type { Skill } from "../types";

const mk = (p: Partial<Skill>): Skill => ({
  id: p.id ?? "c1",
  name: p.name ?? "Test",
  prompt: p.prompt ?? "body",
  desc: p.desc,
  cat: p.cat ?? "redaction",
  pinned: p.pinned,
  uses: p.uses,
  createdAt: p.createdAt ?? 1,
});

const fr = getMessages("fr");

describe("makeCompetence", () => {
  it("trims and stamps a new compétence", () => {
    const c = makeSkill({ name: "  Réponse e-mail  ", prompt: "  Rédige…  ", cat: "redaction" });
    expect(c).toMatchObject({ name: "Réponse e-mail", prompt: "Rédige…", cat: "redaction", uses: 0, pinned: false });
    expect(c?.id).toBeTruthy();
    expect(c?.createdAt).toBeGreaterThan(0);
  });

  it("refuses an empty name or an empty prompt (nothing to save)", () => {
    expect(makeSkill({ name: "", prompt: "x" })).toBeNull();
    expect(makeSkill({ name: "x", prompt: "" })).toBeNull();
    expect(makeSkill({ name: "   ", prompt: "   " })).toBeNull();
  });

  it("falls back to the first category for a missing or unknown one", () => {
    expect(makeSkill({ name: "n", prompt: "p" })?.cat).toBe(SKILL_CATEGORIES[0].id);
    expect(makeSkill({ name: "n", prompt: "p", cat: "bogus" })?.cat).toBe(SKILL_CATEGORIES[0].id);
  });

  it("drops a blank desc rather than storing an empty string", () => {
    expect(makeSkill({ name: "n", prompt: "p", desc: "   " })?.desc).toBeUndefined();
  });
});

describe("competenceCategory", () => {
  it("resolves a known id and degrades on an unknown one instead of throwing", () => {
    expect(skillCategory("code", fr).label).toBe("Code");
    expect(skillCategory("nope", fr).id).toBe(SKILL_CATEGORIES[0].id);
  });
});

describe("filterCompetences", () => {
  const list = [
    mk({ id: "a", name: "Réponse e-mail", cat: "redaction", desc: "un mail" }),
    mk({ id: "b", name: "Revue de code", cat: "code" }),
  ];

  it("filters by category, with `all` keeping everything", () => {
    expect(filterSkills(list, "code", "").map((c) => c.id)).toEqual(["b"]);
    expect(filterSkills(list, "all", "")).toHaveLength(2);
  });

  it("matches name OR desc, case-insensitively", () => {
    expect(filterSkills(list, "all", "RÉPONSE").map((c) => c.id)).toEqual(["a"]);
    expect(filterSkills(list, "all", "un mail").map((c) => c.id)).toEqual(["a"]);
    expect(filterSkills(list, "all", "zzz")).toEqual([]);
  });

  it("combines category AND query", () => {
    expect(filterSkills(list, "code", "réponse")).toEqual([]);
  });
});

describe("competenceCounts", () => {
  it("counts per category plus all, over the WHOLE list", () => {
    const counts = skillCounts([mk({ cat: "code" }), mk({ cat: "code" }), mk({ cat: "analyse" })]);
    expect(counts).toMatchObject({ all: 3, code: 2, analyse: 1 });
  });
});

describe("pinnedCompetences", () => {
  it("keeps only pinned, most-used first then newest", () => {
    const out = pinnedSkills([
      mk({ id: "x", pinned: true, uses: 2, createdAt: 1 }),
      mk({ id: "y", pinned: false, uses: 99 }),
      mk({ id: "z", pinned: true, uses: 5, createdAt: 1 }),
      mk({ id: "w", pinned: true, uses: 2, createdAt: 9 }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["z", "w", "x"]);
  });
});

describe("restoreCompetenceList — the delete's Annuler", () => {
  it("reinserts the deleted entry VERBATIM at the head (same id — deep-links keep resolving)", () => {
    const gone = mk({ id: "gone", name: "Réponse e-mail", uses: 7, pinned: true });
    const out = restoreSkillList([mk({ id: "a" })], gone);
    expect(out[0]).toBe(gone); // verbatim, not a re-minted copy
    expect(out.map((c) => c.id)).toEqual(["gone", "a"]);
  });
  it("is idempotent BY REFERENCE — a double-fired undo returns the same array, no duplicate", () => {
    const list = [mk({ id: "gone" }), mk({ id: "a" })];
    expect(restoreSkillList(list, mk({ id: "gone" }))).toBe(list);
  });
});
