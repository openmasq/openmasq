import { describe, expect, it } from "vitest";
import { ResultEchoLedger } from "./resultEcho";

/* The PROVENANCE exemption of the arg-exfil gate (H-4): a call whose every argument
   string is the VERBATIM echo of a prior result from the SAME connector doesn't
   « leak » anything — the connector itself produced the value (journal 01/08: « données
   glissées » card on `read_document` for a path `find_files` had just
   listed). These cases pin the THREE edges that keep the exemption sound. */

describe("ResultEchoLedger", () => {
  const listing =
    "9 entrée(s) :\n/Users/x/Desktop/Dossier/rapport (2025).pdf\n/Users/x/Desktop/Dossier/notes.csv";

  it("exempte un chemin réécrit verbatim depuis un résultat du même connecteur", () => {
    const l = new ResultEchoLedger();
    l.record("local-filesystem", listing);
    expect(
      l.allArgsEchoed("local-filesystem", { path: "/Users/x/Desktop/Dossier/rapport (2025).pdf" }),
    ).toBe(true);
    // Non-string args (offset/limit) don't invalidate the echo.
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
    // …and the same content stays an echo for ITS OWN origin connector.
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
