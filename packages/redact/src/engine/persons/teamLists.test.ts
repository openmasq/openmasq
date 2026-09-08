import { describe, expect, it } from "vitest";
import { detectTeamRoster } from "./teamLists";

const values = (t: string): string[] => detectTeamRoster(t).map((d) => d.value);

describe("detectTeamRoster — bare first names above role lines", () => {
  it("detects the roster names the NER missed, including out-of-vocabulary ones", () => {
    const page = "Notre équipe\n\nAurélien\nProduct\n\nTharsiga\nSecurity\n\nMilena\ngo-to-market\n\nGrégory\nTECH";
    expect(values(page)).toEqual(["Aurélien", "Tharsiga", "Milena", "Grégory"]);
  });

  it("tolerates blank separator lines and uppercase / compound roles", () => {
    const page = "Léo\n\nCOM\n\nVergnaud\n\nRED TEAM & AI\n\nAstrid\nJOURNALIST";
    expect(values(page)).toEqual(["Léo", "Vergnaud", "Astrid"]);
  });

  it("a section HEADING above a role-ish line never fires — vocabulary lines are not names", () => {
    // "Contact" / "Support" are generic terms themselves; a heading is not a person.
    const page = "Contact\nSupport\n\nNotre équipe\nDesign";
    expect(values(page)).toEqual([]);
  });

  it("ONE isolated pair is ambiguous and never fires (a roster repeats)", () => {
    expect(values("Paris\nTech")).toEqual([]);
  });

  it("prose, digits and punctuation lines never fire", () => {
    const page = "Aurélien a rejoint l'équipe.\nProduct\n\nVersion 2.1\nTech\n\nBonjour tout le monde\nDesign";
    expect(values(page)).toEqual([]);
  });

  it("requires the ROLE gate — a name above ordinary prose is not a roster entry", () => {
    const page = "Aurélien\nest arrivé hier soir\n\nJoséphine\na pris ses fonctions";
    expect(values(page)).toEqual([]);
  });
});
