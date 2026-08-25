import { describe, it, expect } from "vitest";
import {
  COMPETENCE_CATEGORIES,
  competenceCategory,
  competenceCounts,
  filterCompetences,
  makeCompetence,
  pinnedCompetences,
  restoreCompetenceList,
} from "./competences";
import type { Competence } from "../types";

const mk = (p: Partial<Competence>): Competence => ({
  id: p.id ?? "c1",
  name: p.name ?? "Test",
  prompt: p.prompt ?? "body",
  desc: p.desc,
  cat: p.cat ?? "redaction",
  pinned: p.pinned,
  uses: p.uses,
  createdAt: p.createdAt ?? 1,
});

describe("makeCompetence", () => {
  it("trims and stamps a new compétence", () => {
    const c = makeCompetence({ name: "  Réponse e-mail  ", prompt: "  Rédige…  ", cat: "redaction" });
    expect(c).toMatchObject({ name: "Réponse e-mail", prompt: "Rédige…", cat: "redaction", uses: 0, pinned: false });
    expect(c?.id).toBeTruthy();
    expect(c?.createdAt).toBeGreaterThan(0);
  });

  it("refuses an empty name or an empty prompt (nothing to save)", () => {
    expect(makeCompetence({ name: "", prompt: "x" })).toBeNull();
    expect(makeCompetence({ name: "x", prompt: "" })).toBeNull();
    expect(makeCompetence({ name: "   ", prompt: "   " })).toBeNull();
  });

  it("falls back to the first category for a missing or unknown one", () => {
    expect(makeCompetence({ name: "n", prompt: "p" })?.cat).toBe(COMPETENCE_CATEGORIES[0].id);
    expect(makeCompetence({ name: "n", prompt: "p", cat: "bogus" })?.cat).toBe(COMPETENCE_CATEGORIES[0].id);
  });

  it("drops a blank desc rather than storing an empty string", () => {
    expect(makeCompetence({ name: "n", prompt: "p", desc: "   " })?.desc).toBeUndefined();
  });
});

describe("competenceCategory", () => {
  it("resolves a known id and degrades on an unknown one instead of throwing", () => {
    expect(competenceCategory("code").label).toBe("Code");
    expect(competenceCategory("nope")).toBe(COMPETENCE_CATEGORIES[0]);
  });
});

describe("filterCompetences", () => {
  const list = [
    mk({ id: "a", name: "Réponse e-mail", cat: "redaction", desc: "un mail" }),
    mk({ id: "b", name: "Revue de code", cat: "code" }),
  ];

  it("filters by category, with `all` keeping everything", () => {
    expect(filterCompetences(list, "code", "").map((c) => c.id)).toEqual(["b"]);
    expect(filterCompetences(list, "all", "")).toHaveLength(2);
  });

  it("matches name OR desc, case-insensitively", () => {
    expect(filterCompetences(list, "all", "RÉPONSE").map((c) => c.id)).toEqual(["a"]);
    expect(filterCompetences(list, "all", "un mail").map((c) => c.id)).toEqual(["a"]);
    expect(filterCompetences(list, "all", "zzz")).toEqual([]);
  });

  it("combines category AND query", () => {
    expect(filterCompetences(list, "code", "réponse")).toEqual([]);
  });
});

describe("competenceCounts", () => {
  it("counts per category plus all, over the WHOLE list", () => {
    const counts = competenceCounts([mk({ cat: "code" }), mk({ cat: "code" }), mk({ cat: "analyse" })]);
    expect(counts).toMatchObject({ all: 3, code: 2, analyse: 1 });
  });
});

describe("pinnedCompetences", () => {
  it("keeps only pinned, most-used first then newest", () => {
    const out = pinnedCompetences([
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
    const out = restoreCompetenceList([mk({ id: "a" })], gone);
    expect(out[0]).toBe(gone); // verbatim, not a re-minted copy
    expect(out.map((c) => c.id)).toEqual(["gone", "a"]);
  });
  it("is idempotent BY REFERENCE — a double-fired undo returns the same array, no duplicate", () => {
    const list = [mk({ id: "gone" }), mk({ id: "a" })];
    expect(restoreCompetenceList(list, mk({ id: "gone" }))).toBe(list);
  });
});
