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
   * L'ancien bug, désormais impossible : il y avait DEUX listes d'arrivée, chaque écran
   * ne comparait qu'à la sienne, et une routine importée depuis « Compétences » pouvait
   * naître homonyme d'une routine existante — alors que le nom est ce par quoi on la
   * retrouve. Une seule liste ⇒ un seul jeu de noms pris, quel que soit le côté.
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

  // Une plateforme sans destinataire (le créneau est optionnel) ignore l'entrée plutôt
  // que de la ranger n'importe où.
  it("sans destinataire, l'entrée est ignorée", () => {
    const added: string[] = [];
    applySkillImport([item("Revue", true)], { competenceNames: [] });
    expect(added).toEqual([]);
  });
});
