import { describe, it, expect, vi } from "vitest";

// The embedder is a main-process utilityProcess (it imports `electron`). Absent here on
// purpose: this file pins the DEGRADED path — the lexical tier standing alone — which is
// what ships whenever `pnpm bake:embed` hasn't run. `../embed/CLAUDE.md`: a missing
// bundle degrades a FEATURE, it must never break a filesystem tool.
vi.mock("../embed/client", () => ({
  embedAvailable: () => false,
  embedTexts: async () => {
    throw new Error("not bundled");
  },
}));

const { rankFindResults, parseCandidates } = await import("./findFiles");
const { FIND_TRUNCATED_MARKER } = await import("./protocol");

const LISTING = [
  "/d/001 Dépôt des comptes annuels INPI.pdf",
  "/d/Photos vacances 2024.zip",
].join("\n");

describe("parseCandidates — le format qui traverse le fil worker→main", () => {
  it("lit un chemin par ligne et en dérive le nom", () => {
    const { candidates, truncated } = parseCandidates(LISTING);
    expect(candidates.map((c) => c.name)).toEqual([
      "001 Dépôt des comptes annuels INPI.pdf",
      "Photos vacances 2024.zip",
    ]);
    expect(truncated).toBe(false);
  });

  it("reconnaît le marqueur de troncature sans le prendre pour un candidat", () => {
    const { candidates, truncated } = parseCandidates(`${LISTING}\n${FIND_TRUNCATED_MARKER}`);
    expect(candidates).toHaveLength(2);
    expect(truncated).toBe(true);
  });
});

describe("rankFindResults, embedder ABSENT", () => {
  it("apparie encore sur les mots, et DIT que le sémantique manque", async () => {
    const out = await rankFindResults(LISTING, "les comptes annuels");
    expect(out).toContain("/d/001 Dépôt des comptes annuels INPI.pdf");
    expect(out).not.toContain("Photos vacances");
    expect(out).toMatch(/moteur sémantique local indisponible/);
  });

  it("ne prétend RIEN quand aucun mot ne correspond", async () => {
    // The exact request from the trace. Without an embedder, no word is shared: the result
    // must say it found nothing AND why, never return a random list
    // that the model would present as "your tax documents".
    const out = await rankFindResults(LISTING, "les documents fiscaux");
    expect(out).toMatch(/Aucun nom de fichier ne correspond/);
    expect(out).not.toContain("/d/");
    expect(out).toMatch(/moteur sémantique local indisponible/);
  });

  it("annonce une troncature au lieu de présenter un parcours partiel comme complet", async () => {
    const out = await rankFindResults(`${LISTING}\n${FIND_TRUNCATED_MARKER}`, "comptes");
    expect(out).toMatch(/le classement ne porte que sur cette partie/);
  });

  it("un périmètre vide se dit, il ne se devine pas", async () => {
    expect(await rankFindResults("", "comptes")).toBe("(aucun fichier dans ce périmètre)");
  });

  // The model only sees FAKE paths: it cannot verify that a result
  // matches. The result must therefore carry this limitation, or it asserts in its place.
  it("présente un CLASSEMENT, jamais une liste vérifiée", async () => {
    const out = await rankFindResults(LISTING, "comptes annuels");
    expect(out).toMatch(/pas\s+une liste vérifiée/);
  });

  // …but this limitation must NOT push toward fan-out: « ouvre un fichier pour
  // confirmer » made it verify the 11 files one by one on a simple LIST
  // request (log 01/08 — 11 get_file_info, turn aborted at the cap). The instruction now
  // says: list ⇒ answer with the list; open ⇒ only for the CONTENT.
  it("dit de répondre avec la liste SANS ouvrir de fichier (l'ouverture = contenu seulement)", async () => {
    const out = await rankFindResults(LISTING, "comptes annuels");
    expect(out).toMatch(/n'ouvre AUCUN fichier/);
    expect(out).toMatch(/CONTENU/);
    expect(out).not.toMatch(/ouvre un fichier pour confirmer/);
  });
});
