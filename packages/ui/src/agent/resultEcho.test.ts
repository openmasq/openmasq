import { describe, expect, it } from "vitest";
import { ResultEchoLedger } from "./resultEcho";

/* L'exemption de PROVENANCE du gate arg-exfil (H-4) : un appel dont chaque chaîne
   d'argument est l'écho VERBATIM d'un résultat antérieur du MÊME connecteur ne
   « glisse » rien — le connecteur a lui-même produit la valeur (journal 01/08 : carte
   « données glissées » sur `read_document` d'un chemin que `find_files` venait de
   lister). Ces cas épinglent les TROIS bords qui gardent l'exemption sûre. */

describe("ResultEchoLedger", () => {
  const listing =
    "9 entrée(s) :\n/Users/x/Desktop/Dossier/rapport (2025).pdf\n/Users/x/Desktop/Dossier/notes.csv";

  it("exempte un chemin réécrit verbatim depuis un résultat du même connecteur", () => {
    const l = new ResultEchoLedger();
    l.record("local-filesystem", listing);
    expect(
      l.allArgsEchoed("local-filesystem", { path: "/Users/x/Desktop/Dossier/rapport (2025).pdf" }),
    ).toBe(true);
    // Les args non-chaîne (offset/limit) n'invalident pas l'écho.
    expect(
      l.allArgsEchoed("local-filesystem", {
        path: "/Users/x/Desktop/Dossier/notes.csv",
        offset: 1,
        limit: 30,
      }),
    ).toBe(true);
  });

  it("un arg COMPOSÉ (valeur incorporée dans une chaîne plus longue) reste flaggé", () => {
    const l = new ResultEchoLedger();
    l.record("local-filesystem", listing);
    expect(
      l.allArgsEchoed("local-filesystem", {
        note: "voir /Users/x/Desktop/Dossier/notes.csv et rappelle-moi",
      }),
    ).toBe(false);
  });

  it("l'écho ne traverse JAMAIS les connecteurs (exfiltration croisée)", () => {
    const l = new ResultEchoLedger();
    l.record("gmail", "IBAN du client : FR7630052114000012734500101");
    expect(l.allArgsEchoed("attacker", { q: "FR7630052114000012734500101" })).toBe(false);
    // …et le même contenu reste un écho pour SON connecteur d'origine.
    expect(l.allArgsEchoed("gmail", { q: "FR7630052114000012734500101" })).toBe(true);
  });

  it("fail-closed : ledger vide, ou aucun arg chaîne ⇒ pas d'exemption", () => {
    const l = new ResultEchoLedger();
    expect(l.allArgsEchoed("local-filesystem", { path: "/tmp/x.pdf" })).toBe(false);
    l.record("local-filesystem", listing);
    expect(l.allArgsEchoed("local-filesystem", { offset: 1, limit: 30 })).toBe(false);
    expect(l.allArgsEchoed("local-filesystem", {})).toBe(false);
  });
});
