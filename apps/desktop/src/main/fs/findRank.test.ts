import { describe, it, expect } from "vitest";
import { fold, queryTerms, lexicalScore, relativeCosines, rankCandidates } from "./findRank";

/**
 * `find_files` exists because a SUBSTRING doesn't answer a question asked by
 * meaning. The measured case: "list the tax documents" on a folder containing
 * "001 Filing of annual accounts … INPI … .pdf" — zero words in common, so
 * `search_files pattern:"fiscal"` returned "no results" and the model concluded
 * there was no tax document. These tests pin down the two layers that
 * fix that, and the boundary between them.
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
    // Otherwise "Documents divers.pdf" would win on "documents", which matches half
    // the disk — exactly the false positive the semantic layer has to settle.
    expect(queryTerms("liste tous les documents")).toEqual([]);
  });

  // The trap the first version fell into: `isGenericTerm` (redact)
  // classes `fiscal`/`comptes`/`annuel`/`bail`/`facture` as generic — because they
  // aren't PII. Filtering on that removed the ONLY useful word in the query.
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
  // THE regression: no word in common between the request and the file name.
  it("remonte le bon fichier sur « documents fiscaux » grâce au seul sémantique", () => {
    const cos = [0.93, 0.84, 0.87]; // the INPI filing is the closest
    const out = rankCandidates(CANDS, "liste les documents fiscaux", cos, 3);
    expect(out[0].path).toBe(CANDS[0].path);
  });

  it("un vrai mot du nom l'emporte TOUJOURS sur une proximité sémantique", () => {
    // "vacances" is literally in the name: even with an unfavorable cosine,
    // the user typing a word present in the name is designating that file.
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
