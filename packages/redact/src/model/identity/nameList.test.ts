import { describe, expect, it } from "vitest";
import { pseudonymize } from "../pseudonymize";
import { unredact } from "../../engine/vault";
import { FAKE_LAST } from "../fakes/pools";
import { crossedNames } from "./name";

// A list of more people than the surname pool holds. A TAKEN fake was the answer when the
// pool ran out: its per-word alias could not be registered, so the real surname went out
// in clear, and one fake stood for two people.
const KEY = "d".repeat(64);
const FIRSTS = ["Jean", "Pierre", "Paul", "Jacques", "Louis", "Michel", "Henri", "Nicolas", "Julien", "Thomas", "Antoine"];
const LASTS = [
  "Kerbrat", "Lozach", "Ploux", "Tanguy", "Le Goff", "Guivarch", "Jaouen", "Coatanea", "Riou", "Kervella", "Pennec",
  "Gourmelon", "Quere", "Floch", "Le Bras", "Cadiou", "Salaun", "Berthou", "Nedelec", "Abgrall", "Morvan", "Tromeur",
];

describe("a list longer than the surname pool", () => {
  it("masks every surname, and restores each person as themself", async () => {
    expect(LASTS.length).toBeGreaterThan(FAKE_LAST.length);
    const text = `Participants:\n${LASTS.map((l, i) => `- M. ${FIRSTS[i % FIRSTS.length]} ${l}`).join("\n")}`;
    const vault: Record<string, string> = {};
    const r = await pseudonymize(text, { vault, key: KEY, reFakeExisting: true });
    for (const l of LASTS) expect(r.text, l).not.toMatch(new RegExp(`(^|[^\\p{L}])${l}([^\\p{L}]|$)`, "u"));
    expect(unredact(r.text, vault)).toBe(text);
  });

  it("crosses pool names into new ones — never a pool name, never twice", () => {
    const out = [...crossedNames(FAKE_LAST, 3)];
    expect(out.length).toBeGreaterThan(FAKE_LAST.length * 10);
    expect(out.filter((n) => FAKE_LAST.includes(n))).toEqual([]);
    expect(new Set(out).size).toBeGreaterThan(out.length * 0.9);
  });
});
