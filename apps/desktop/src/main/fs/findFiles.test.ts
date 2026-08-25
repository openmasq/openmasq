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
    // La demande exacte de la trace. Sans embedder, aucun mot n'est commun : le résultat
    // doit dire qu'il n'a rien trouvé ET pourquoi, jamais renvoyer une liste au hasard
    // que le modèle présenterait comme « vos documents fiscaux ».
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

  // Le modèle ne voit que des chemins FAUX : il ne peut pas vérifier qu'un résultat
  // correspond. Le résultat doit donc porter cette limite, sinon il affirme à sa place.
  it("présente un CLASSEMENT, jamais une liste vérifiée", async () => {
    const out = await rankFindResults(LISTING, "comptes annuels");
    expect(out).toMatch(/pas\s+une liste vérifiée/);
  });

  // …mais cette limite ne doit PAS pousser au fan-out : « ouvre un fichier pour
  // confirmer » a fait vérifier les 11 fichiers un par un sur une simple demande de
  // LISTE (journal 01/08 — 11 get_file_info, tour avorté au cap). La consigne dit
  // désormais : lister ⇒ répondre avec la liste ; ouvrir ⇒ seulement pour le CONTENU.
  it("dit de répondre avec la liste SANS ouvrir de fichier (l'ouverture = contenu seulement)", async () => {
    const out = await rankFindResults(LISTING, "comptes annuels");
    expect(out).toMatch(/n'ouvre AUCUN fichier/);
    expect(out).toMatch(/CONTENU/);
    expect(out).not.toMatch(/ouvre un fichier pour confirmer/);
  });
});
