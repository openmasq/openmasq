import { describe, expect, it } from "vitest";
import { mergeLegacyWorkflows, workflowToCompetence } from "./migrate";
import { normalizeSettings } from "../state/storePersistence";
import type { Competence, Settings } from "../types";

/**
 * LA REPRISE DE L'ANCIENNE LISTE — le seul endroit de la fusion où quelqu'un peut PERDRE
 * quelque chose. Une compétence mal rangée se re-range ; une liste qui n'arrive pas est
 * partie. On épingle donc les quatre choses qui la rendent sûre : les ids survivent, rien
 * ne se duplique en rejouant, le champ est effacé après coup, et une reprise blanche
 * n'écrit rien.
 */

const wf = (id: string, over: Partial<Competence> = {}): Competence =>
  ({
    id,
    name: `Routine ${id}`,
    prompt: "corps",
    servers: ["gmail"],
    createdAt: 1,
    ...over,
  }) as Competence;

const comp = (id: string): Competence =>
  ({ id, name: `Compétence ${id}`, prompt: "corps", cat: "redaction", createdAt: 1 }) as Competence;

describe("workflowToCompetence", () => {
  it("range un ex-workflow en « Routines » et lui garde ses connecteurs", () => {
    const c = workflowToCompetence(wf("a"));
    expect(c.cat).toBe("routine");
    expect(c.servers).toEqual(["gmail"]);
    expect(c.id).toBe("a");
  });

  it("une liste de connecteurs VIDE disparaît — le champ doit rester le test de « pilote des outils »", () => {
    expect(workflowToCompetence(wf("a", { servers: [] })).servers).toBeUndefined();
  });

  it("une catégorie déjà posée n'est pas réécrite", () => {
    expect(workflowToCompetence(wf("a", { cat: "code" })).cat).toBe("code");
  });
});

describe("mergeLegacyWorkflows", () => {
  it("verse l'ancienne liste à la suite, en gardant les ids", () => {
    const out = mergeLegacyWorkflows([comp("c1")], [wf("w1")])!;
    expect(out.map((c) => c.id)).toEqual(["c1", "w1"]);
  });

  it("rejouée, elle ne duplique rien — sinon rouvrir l'app doublerait la liste", () => {
    const once = mergeLegacyWorkflows([comp("c1")], [wf("w1")])!;
    expect(mergeLegacyWorkflows(once, [wf("w1")])).toBeNull();
  });

  it("rien à reprendre ⇒ `null`, donc aucun état écrit au chargement", () => {
    expect(mergeLegacyWorkflows([comp("c1")], [])).toBeNull();
    expect(mergeLegacyWorkflows(undefined, undefined)).toBeNull();
  });
});

describe("normalizeSettings — un blob écrit AVANT la fusion", () => {
  it("ramène les workflows dans les compétences et efface le champ", () => {
    const out = normalizeSettings({
      competences: [comp("c1")],
      workflows: [wf("w1")],
    } as Settings);

    expect(out.competences?.map((c) => c.id)).toEqual(["c1", "w1"]);
    expect(out.competences?.find((c) => c.id === "w1")?.servers).toEqual(["gmail"]);
    // Effacé : sans ça la reprise se rejouerait à chaque chargement, et le champ
    // resterait à traîner en clair dans le miroir localStorage.
    expect(out.workflows).toBeUndefined();
  });

  it("un blob qui n'a JAMAIS eu de workflows traverse sans y toucher", () => {
    const out = normalizeSettings({ competences: [comp("c1")] } as Settings);
    expect(out.competences?.map((c) => c.id)).toEqual(["c1"]);
    expect(out.workflows).toBeUndefined();
  });
});
