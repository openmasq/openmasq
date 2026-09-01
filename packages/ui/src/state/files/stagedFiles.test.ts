import { describe, expect, it } from "vitest";
import { createStagedFiles } from "./stagedFiles";

const f = (name: string) => ({ cid: name, name });

describe("stagedFiles — les fichiers en attente appartiennent à la CONVERSATION", () => {
  it("survivent à la disparition de l'écran : ce qui est garé se relit", () => {
    // The original bug: navigating to Bibliothèque unmounted ChatView and took with it
    // a document whose extraction and redaction had already been awaited.
    const s = createStagedFiles();
    s.set("c1", [f("contrat.pdf")]);
    expect(s.get("c1")).toHaveLength(1);
  });

  it("ne débordent JAMAIS sur une autre conversation", () => {
    // The other half of the same bug, and the worse one: the screen doesn't remount on
    // a thread change, so a file prepared for one conversation ended up one click
    // away from being sent to the other.
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
    // A fresh array on every read would retrigger the screen's restoration effect
    // in a loop: reference stability is part of the contract.
    const s = createStagedFiles();
    expect(s.get("jamais-vue")).toBe(s.get("autre-inconnue"));
  });
});

describe("le passage de relais « Demander » — une cible nommée, pas « l'écran courant »", () => {
  it("un fichier peut être garé pour une conversation qui n'est pas encore affichée", () => {
    // The reported bug: « Demander » creates the conversation AND stages the file
    // in the same gesture, but the new conversation only reaches the screen one render
    // later. Staged onto « ce qui est affiché », the file would land on the
    // PREVIOUS one — then vanish once the new one arrived.
    const s = createStagedFiles();
    s.set("conv-nouvelle", [f("attestation.pdf")]);
    // The screen is still on the old one: it must receive nothing…
    expect(s.get("conv-precedente")).toEqual([]);
    // …and the new one finds its file on arrival, regardless of order.
    expect(s.get("conv-nouvelle")).toHaveLength(1);
  });
})
