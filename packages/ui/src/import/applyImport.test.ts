import { describe, expect, it } from "vitest";
import { applySkillImport, type ImportChoice } from "./applyImport";

const item = (name: string, asWorkflow = false): ImportChoice => ({
  name,
  desc: "",
  prompt: "corps",
  asWorkflow,
});

function collect(existing: string[] = []) {
  const added: { name: string; cat: string }[] = [];
  return {
    added,
    targets: {
      competenceNames: existing,
      addCompetence: (i: { name: string; cat: string }) => void added.push(i),
    },
  };
}

describe("applySkillImport", () => {
  it("tout arrive dans UNE liste ; « ça pilote des outils » ne choisit plus qu'une catégorie", () => {
    const c = collect();
    applySkillImport([item("Relecture"), item("Revue de PR", true)], c.targets);
    expect(c.added.map((a) => a.name)).toEqual(["Relecture", "Revue de PR"]);
    expect(c.added.map((a) => a.cat)).toEqual(["redaction", "routine"]);
  });

  it("n'écrase jamais un nom existant", () => {
    const c = collect(["Relecture"]);
    applySkillImport([item("Relecture")], c.targets);
    expect(c.added.map((a) => a.name)).toEqual(["Relecture (2)"]);
  });

  /**
   * The old bug, now impossible: there were TWO destination lists, each screen compared
   * only against its own, and a routine imported from « Compétences » could be born a
   * homonym of an existing routine — while the name is how one finds it again. A single
   * list ⇒ a single set of taken names, whichever side.
   */
  it("un nom pris l'est pour tout le monde, routine ou non", () => {
    const c = collect(["Revue de PR"]);
    applySkillImport([item("Revue de PR", true)], c.targets);
    expect(c.added.map((a) => a.name)).toEqual(["Revue de PR (2)"]);
  });

  it("deux entrées homonymes du même lot ne se marchent pas dessus", () => {
    const c = collect();
    applySkillImport([item("Notes"), item("Notes")], c.targets);
    expect(c.added.map((a) => a.name)).toEqual(["Notes", "Notes (2)"]);
  });

  // A platform with no destination (the slot is optional) ignores the entry rather than
  // filing it just anywhere.
  it("sans destinataire, l'entrée est ignorée", () => {
    const added: string[] = [];
    applySkillImport([item("Revue", true)], { competenceNames: [] });
    expect(added).toEqual([]);
  });
});
