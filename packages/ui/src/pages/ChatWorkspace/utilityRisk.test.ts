import { describe, it, expect } from "vitest";
import { utilityRisk, riskValues, attachmentCats } from "./utilityRisk";
import type { Cat } from "./composerDetection";

/**
 * The utility warning: the REPLY will depend on redacted data.
 *
 * The central invariant is the rule of TWO conditions — question motif AND redacted
 * data of the category — because a warning that talks too much teaches clicking
 * without reading (the written lesson of the write gate, `writeConfirm.ts`). The risks and
 * their figures: `packages/redact/bench/RAPPORT-risques-utilite-2026-07.md`.
 */
const dob: Cat = { value: "12/03/1994", cat: "dob" };
const company: Cat = { value: "Karl Studio", cat: "company" };
const address: Cat = { value: "14 cours de l'Intendance, 33000 Bordeaux", cat: "address" };
const name: Cat = { value: "Nadia Merbah", cat: "name" };

describe("utilityRisk — les deux conditions, ou rien", () => {
  it("calcul d'âge + date redacted ⇒ risque « age », ciblé sur la date", () => {
    const r = utilityRisk("Quel âge a la patiente née le 12/03/1994 ?", [dob, name]);
    expect(r?.kind).toBe("age");
    expect(riskValues(r!, [dob, name])).toEqual(["12/03/1994"]);
  });

  it("connaissance du monde + entreprise redacted ⇒ « world »", () => {
    expect(utilityRisk("Que fait Karl Studio exactement ?", [company])?.kind).toBe("world");
    expect(utilityRisk("Quels sont les concurrents de Karl Studio ?", [company])?.kind).toBe("world");
  });

  it("géo dérivée + adresse redacted ⇒ « geo »", () => {
    expect(
      utilityRisk("Quelle distance entre chez lui et le cabinet ?", [address])?.kind,
    ).toBe("geo");
    expect(utilityRisk("Est-ce la même ville que le siège ?", [address])?.kind).toBe("geo");
  });

  it("le MOTIF seul ne suffit pas — sans donnée de la catégorie, rien", () => {
    // An age question with no redacted date is an ordinary question.
    expect(utilityRisk("Quel âge a Louis XIV à son sacre ?", [name])).toBeNull();
    expect(utilityRisk("Que fait une entreprise de conseil, en général ?", [dob])).toBeNull();
  });

  it("la DONNÉE seule ne suffit pas — sans motif, rien", () => {
    expect(utilityRisk("Corrige ce courrier pour Nadia, née le 12/03/1994.", [dob, name])).toBeNull();
    expect(utilityRisk("Résume le contrat de Karl Studio.", [company])).toBeNull();
  });

  it("un seul risque à la fois — l'âge prime (deux pastilles seraient du bruit)", () => {
    const r = utilityRisk(
      "Quel âge a le gérant, et que fait Karl Studio ?",
      [dob, company],
    );
    expect(r?.kind).toBe("age");
  });

  it("anglais couvert — les retours d'outils et les prompts EN sont ordinaires", () => {
    expect(utilityRisk("How old is the applicant born 12/03/1994?", [dob])?.kind).toBe("age");
    expect(utilityRisk("How far is his place from the office?", [address])?.kind).toBe("geo");
  });

  it("brouillon vide ou sans détection ⇒ null (jamais de pastille à froid)", () => {
    expect(utilityRisk("", [dob])).toBeNull();
    expect(utilityRisk("Quel âge a-t-elle ?", [])).toBeNull();
  });
});

describe("attachmentCats — les pièces jointes nourrissent l'avertissement", () => {
  // The real case (15/08, health scenario): the date of birth lives in the DOCUMENT,
  // not in the draft — a substitute born in 1948 for a 57-year-old patient, a reply
  // calibrated for « personne âgée » with nothing warning about it.
  const dossier = {
    replacements: [
      { real: "14/11/1968", fake: "13/12/1948", kind: "dob" },
      { real: "Soizic Le Danvez", fake: "Mahaut Le Fressineau", kind: "name" },
    ],
  };

  it("une DOB dans une pièce jointe déclenche le risque « âge » du brouillon", () => {
    const cats = attachmentCats([dossier]);
    expect(utilityRisk("Quel âge a la patiente, et la cible est-elle adaptée ?", cats)?.kind).toBe(
      "age",
    );
  });

  it("une valeur RÉVÉLÉE part en clair : plus un risque", () => {
    const cats = attachmentCats([{ ...dossier, reveal: ["14/11/1968"] }]);
    expect(cats.find((c) => c.cat === "dob")).toBeUndefined();
    expect(utilityRisk("Quel âge a la patiente ?", cats)).toBeNull();
  });

  it("un replacement sans kind (carte ancienne) est ignoré, jamais deviné", () => {
    expect(attachmentCats([{ replacements: [{ real: "x" }] }])).toEqual([]);
  });

  it("riskValues rend la valeur de la pièce, pour le geste « garder en clair »", () => {
    const cats = attachmentCats([dossier]);
    const r = utilityRisk("Quel âge a la patiente ?", cats)!;
    expect(riskValues(r, cats)).toEqual(["14/11/1968"]);
  });
});
