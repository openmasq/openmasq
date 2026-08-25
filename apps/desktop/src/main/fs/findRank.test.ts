import { describe, it, expect } from "vitest";
import { fold, queryTerms, lexicalScore, relativeCosines, rankCandidates } from "./findRank";

/**
 * `find_files` existe parce qu'une SOUS-CHAÎNE ne répond pas à une question posée par
 * le sens. Le cas mesuré : « liste les documents fiscaux » sur un dossier contenant
 * « 001 Dépôt des comptes annuels … INPI … .pdf » — zéro mot en commun, donc
 * `search_files pattern:"fiscal"` renvoyait « aucun résultat » et le modèle concluait
 * qu'il n'y avait aucun document fiscal. Ces tests épinglent les deux étages qui
 * réparent ça, et la frontière entre eux.
 */

const CANDS = [
  { path: "/d/001 Dépôt des comptes annuels INPI Karl Studio.pdf", name: "001 Dépôt des comptes annuels INPI Karl Studio.pdf" },
  { path: "/d/Photos vacances 2024.zip", name: "Photos vacances 2024.zip" },
  { path: "/d/Documents divers.pdf", name: "Documents divers.pdf" },
];

describe("normalisation", () => {
  it("plie accents et casse (« Dépôt » se cherche « depot »)", () => {
    expect(fold("Dépôt Annuel")).toBe("depot annuel");
    expect(lexicalScore(["depot"], "001 Dépôt des comptes.pdf")).toBe(1);
  });
});

describe("queryTerms — ce qui mérite un appariement LITTÉRAL", () => {
  it("écarte les mots vides et les mots qui CADRENT la recherche", () => {
    expect(queryTerms("liste les documents fiscaux")).toEqual(["fiscaux"]);
    expect(queryTerms("trouve le dossier du bail")).toEqual(["bail"]);
  });

  it("une requête entièrement de cadrage ne laisse RIEN de littéral", () => {
    // Sinon « Documents divers.pdf » gagnerait sur « documents », qui matche la moitié
    // du disque — exactement le faux positif que l'étage sémantique doit trancher.
    expect(queryTerms("liste tous les documents")).toEqual([]);
  });

  // Le piège dans lequel la première version est tombée : `isGenericTerm` (redact)
  // classe `fiscal`/`comptes`/`annuel`/`bail`/`facture` comme génériques — parce qu'ils
  // ne sont pas du PII. Filtrer là-dessus supprimait le SEUL mot utile de la requête.
  it("garde le vocabulaire documentaire, que redact classe pourtant en générique", () => {
    expect(queryTerms("comptes annuels")).toEqual(["comptes", "annuels"]);
    expect(queryTerms("les factures et le bilan")).toEqual(["factures", "bilan"]);
  });
});

describe("cosinus e5 — lus en RELATIF, jamais en absolu", () => {
  it("renormalise dans le lot (la ligne de base e5 est ~0.85 entre textes sans rapport)", () => {
    expect(relativeCosines([0.86, 0.91, 0.88])).toEqual([0, 1, 0.4]);
  });

  it("un lot plat ne porte aucun signal", () => {
    expect(relativeCosines([0.87, 0.87, 0.87])).toEqual([0, 0, 0]);
  });
});

describe("classement", () => {
  // LA régression : aucun mot commun entre la demande et le nom du fichier.
  it("remonte le bon fichier sur « documents fiscaux » grâce au seul sémantique", () => {
    const cos = [0.93, 0.84, 0.87]; // le dépôt INPI est le plus proche
    const out = rankCandidates(CANDS, "liste les documents fiscaux", cos, 3);
    expect(out[0].path).toBe(CANDS[0].path);
  });

  it("un vrai mot du nom l'emporte TOUJOURS sur une proximité sémantique", () => {
    // « vacances » est littéralement dans le nom : même avec un cosinus défavorable,
    // l'utilisateur qui tape un mot présent dans le nom désigne ce fichier-là.
    const cos = [0.95, 0.80, 0.9];
    const out = rankCandidates(CANDS, "photos de vacances", cos, 3);
    expect(out[0].path).toBe(CANDS[1].path);
  });

  it("sans embedder, l'étage lexical fonctionne seul (dégradation, pas panne)", () => {
    const out = rankCandidates(CANDS, "comptes annuels", undefined, 3);
    expect(out.map((r) => r.path)).toEqual([CANDS[0].path]);
  });

  it("sans embedder ET sans mot commun, il ne renvoie RIEN plutôt que du bruit", () => {
    expect(rankCandidates(CANDS, "documents fiscaux", undefined, 3)).toEqual([]);
  });

  it("respecte k", () => {
    expect(rankCandidates(CANDS, "documents fiscaux", [0.93, 0.84, 0.87], 2)).toHaveLength(2);
  });
});
