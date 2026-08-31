import { describe, expect, it } from "vitest";
import { isGenericTerm } from "./genericTerms";

describe("jours et mois — jamais une entité à eux seuls", () => {
  /**
   * 04/08 log, on a real mailbox: « Sun » redacted as ORGANIZATION,
   * « Thu » as PLACE. They sit in the `Date:` header of every e-mail, at the start of the
   * line and capitalized — exactly the shape a NER reads as a proper noun. The model was
   * receiving « Ash, 02 Aug 2026 », in a request about « the week's e-mails ».
   */
  it("écarte les jours et les abréviations de mois, FR et EN", () => {
    for (const v of ["Sun", "Thu", "Fri", "Sat", "Wed", "Mon", "dim", "jeu", "ven",
                     "Aug", "Jul", "Jan", "Feb", "Dec", "déc", "avr", "juil"])
      expect(isGenericTerm(v), v).toBe(true);
  });

  it("tolère le point d'abréviation collé", () => {
    expect(isGenericTerm("Aug.")).toBe(true);
    expect(isGenericTerm("janv.")).toBe(true);
  });

  it("⚠️ n'écarte PAS les mots de date qui doublent un prénom", () => {
    // The allow-list discipline already pinned by `aiKinds.test.ts`: someone is named
    // Avril, June or Mars, and dropping it would leave it in clear forever. « mar » is
    // excluded for the same reason (mars/March).
    for (const v of ["mars", "avril", "mai", "march", "april", "may", "june", "august", "mar"])
      expect(isGenericTerm(v), v).toBe(false);
  });

  it("ne touche pas à un nom qui COMMENCE par un mot de calendrier", () => {
    // WHOLE value only — otherwise a real company would slip through the net.
    expect(isGenericTerm("Sun Microsystems")).toBe(false);
    expect(isGenericTerm("Friday Beers SAS")).toBe(false);
  });
});

/**
 * 15/08 log — the `execute-sql` (PostHog) tool's doc was leaving REDACTED to the
 * model: « ##### 1. System Data » read as a name manufactured the System/system aliases, and
 * « entity » became a surname. `applyVault` then rewrote EVERY occurrence in
 * the conversation, tool results included — the model was reading a doc describing
 * `ghislain.*` tables and writing SQL against them. Same family as « data »→« lucas »
 * and « UTC »→« HAL » already handled: the block covered data/schema/query, not the two words
 * that STRUCTURE these docs.
 */
describe("vocabulaire d'outil — les mots qui structurent une doc ne sont jamais une PII", () => {
  it("les mots exacts du journal", () => {
    for (const v of ["system", "System", "SYSTEM", "entity", "Entity", "entités"])
      expect(isGenericTerm(v), v).toBe(true);
  });

  it("le voisinage de la même doc", () => {
    for (const v of ["column", "colonnes", "rows", "catalogue", "warehouse", "cursor", "offset"])
      expect(isGenericTerm(v), v).toBe(true);
  });

  it("⚠️ valeur ENTIÈRE seulement — une vraie société garde son filet", () => {
    // La discipline du bloc : « Sun Microsystems » reste un candidat, et le nom d'une
    // société qui CONTIENT le mot ne s'échappe pas par cette porte.
    for (const v of ["System Solutions SARL", "Entity Group", "Cursor SA"])
      expect(isGenericTerm(v), v).toBe(false);
  });
});
