import { describe, it, expect, vi } from "vitest";
import { shouldSweepDeletions, sweepDeletions } from "./dbWipeGuard";

const m = (ids: string[]) => new Map(ids.map((id) => [id, 1]));

describe("sweepDeletions — le balayage du miroir, garde comprise", () => {
  it("supprime ce que le carnet connaît et que l'état n'a plus", () => {
    const del = vi.fn();
    sweepDeletions(m(["a", "b", "c"]), m(["a"]), del);
    expect(del.mock.calls.map((c) => c[0]).sort()).toEqual(["b", "c"]);
  });

  it("un état VIDÉ face à plusieurs connues ne supprime RIEN (le vidage du 13/08)", () => {
    const del = vi.fn();
    sweepDeletions(m(["a", "b", "c"]), m([]), del);
    expect(del).not.toHaveBeenCalled();
  });

  it("supprimer son unique conversation passe", () => {
    const del = vi.fn();
    sweepDeletions(m(["a"]), m([]), del);
    expect(del).toHaveBeenCalledWith("a");
  });
});

describe("shouldSweepDeletions — un vidage mémoire n'est jamais un DELETE de masse", () => {
  it("REFUSE le balayage quand l'état est vide face à plusieurs conversations connues", () => {
    expect(shouldSweepDeletions(0, 55)).toBe(false);
    expect(shouldSweepDeletions(0, 2)).toBe(false);
  });

  it("laisse passer la suppression de son UNIQUE conversation", () => {
    expect(shouldSweepDeletions(0, 1)).toBe(true);
  });

  it("laisse passer les suppressions ordinaires (l'état garde des conversations)", () => {
    expect(shouldSweepDeletions(1, 2)).toBe(true);
    expect(shouldSweepDeletions(54, 55)).toBe(true);
  });

  it("un état et un carnet vides n'ont rien à balayer, mais rien à refuser non plus", () => {
    expect(shouldSweepDeletions(0, 0)).toBe(true);
  });
});
