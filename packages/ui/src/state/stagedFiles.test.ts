import { describe, expect, it } from "vitest";
import { createStagedFiles } from "./stagedFiles";

const f = (name: string) => ({ cid: name, name });

describe("stagedFiles — les fichiers en attente appartiennent à la CONVERSATION", () => {
  it("survivent à la disparition de l'écran : ce qui est garé se relit", () => {
    // Le bug d'origine : aller dans Bibliothèque démontait ChatView et emportait un
    // document dont l'extraction et le redaction avaient déjà été attendus.
    const s = createStagedFiles();
    s.set("c1", [f("contrat.pdf")]);
    expect(s.get("c1")).toHaveLength(1);
  });

  it("ne débordent JAMAIS sur une autre conversation", () => {
    // L'autre moitié du même bug, et la plus grave : l'écran ne se remonte pas au
    // changement de fil, donc un fichier préparé pour l'un se retrouvait à un clic
    // d'être envoyé dans l'autre.
    const s = createStagedFiles();
    s.set("c1", [f("bulletin-de-paie.pdf")]);
    expect(s.get("c2")).toEqual([]);
    s.set("c2", [f("devis.pdf")]);
    expect(s.get("c1").map((x) => (x as { name: string }).name)).toEqual(["bulletin-de-paie.pdf"]);
  });

  it("une liste vidée ne laisse rien derrière elle", () => {
    const s = createStagedFiles();
    s.set("c1", [f("a.pdf")]);
    s.set("c1", []);
    expect(s.get("c1")).toEqual([]);
  });

  it("la conversation supprimée emporte ses fichiers", () => {
    const s = createStagedFiles();
    s.set("c1", [f("a.pdf")]);
    s.drop("c1");
    expect(s.get("c1")).toEqual([]);
  });

  it("une conversation vide rend TOUJOURS la même liste — pas un tableau neuf", () => {
    // Un tableau frais à chaque lecture relancerait l'effet de restauration de l'écran
    // en boucle : la stabilité de référence fait partie du contrat.
    const s = createStagedFiles();
    expect(s.get("jamais-vue")).toBe(s.get("autre-inconnue"));
  });
});

describe("le passage de relais « Demander » — une cible nommée, pas « l'écran courant »", () => {
  it("un fichier peut être garé pour une conversation qui n'est pas encore affichée", () => {
    // Le défaut signalé : « Demander » crée la conversation ET met le fichier en scène
    // dans le même geste, mais la nouvelle conversation n'atteint l'écran qu'un rendu plus
    // tard. Mis en scène sur « ce qui est affiché », le fichier atterrissait sur la
    // PRÉCÉDENTE — puis disparaissait quand la nouvelle arrivait.
    const s = createStagedFiles();
    s.set("conv-nouvelle", [f("attestation.pdf")]);
    // L'écran est encore sur l'ancienne : elle ne doit rien recevoir…
    expect(s.get("conv-precedente")).toEqual([]);
    // …et la nouvelle trouve son fichier en arrivant, quel que soit l'ordre.
    expect(s.get("conv-nouvelle")).toHaveLength(1);
  });
})
