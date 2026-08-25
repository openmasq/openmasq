import { describe, it, expect } from "vitest";
import { isEntryVisibleIn } from "./debugScope";

/**
 * Le trou que ces tests gardent fermé.
 *
 * Une entrée SANS `conv` était traitée comme « niveau application », donc affichée dans
 * TOUTES les conversations — mapping redacted→original compris. Constaté en usage réel : le
 * journal d'une conversation Gmail montrait la table de correspondance d'un PDF INPI
 * redacted des heures plus tôt, avec les vrais nom, adresses et numéro d'entreprise.
 *
 * Le coffre est par conversation par CONSTRUCTION. Sa table apparaissant à côté d'un échange
 * sans rapport casse précisément l'isolement qu'il existe pour donner — et un journal se
 * copie, se colle dans un rapport de bug, se montre à quelqu'un.
 *
 * ⚠️ L'émetteur n'est pas fautif au sens strict : une pièce jointe déposée AVANT qu'une
 * conversation existe n'a aucun id à estampiller (`conversation?.id` vaut undefined à ce
 * moment). C'est pourquoi la règle porte sur le CONTENU et non sur l'émetteur : elle tient
 * pour le prochain qui oubliera, et il y en aura un.
 */
describe("portée du journal — une entrée non attribuable ne fuit nulle part", () => {
  const pairs = [{ token: "Marnco & Co", original: "Karl Studio" }];

  it("MASQUE partout une entrée sans conv qui porte le mapping réel", () => {
    const e = { id: "d1", at: 0, type: "tool" as const, name: "document-redaction", ok: true, pairs };
    expect(isEntryVisibleIn(e, "c1")).toBe(false);
    expect(isEntryVisibleIn(e, "c2")).toBe(false);
    expect(isEntryVisibleIn(e, undefined)).toBe(false); // pas même « hors conversation »
  });

  it("masque de même une entrée sans conv qui porte un extrait de coffre", () => {
    const e = { id: "d2", at: 0, type: "wire" as const, model: "m", text: "t", vault: { A: "Karl Studio" } };
    expect(isEntryVisibleIn(e, "c1")).toBe(false);
  });

  // ⚠️ Ce cas disait l'INVERSE jusqu'au 12/08 : une entrée sans valeurs réelles était
  // « niveau application », donc affichée partout. Renversé sur constat d'usage — le
  // journal d'une conversation restait le MÊME en changeant de conversation. Le journal est
  // par conversation sans exception (la modale l'écrit), et plus aucun émetteur ne produit
  // d'entrée non attribuée : « pas encore de conversation » est `DRAFT_CONV`, pas
  // `undefined`. Ce qui restait passait par cette branche n'était donc que du persisté
  // d'avant l'estampillage. Voir `debugScope.ts` pour le corollaire assumé.
  it("une entrée sans conv ne s'affiche NULLE PART, même inoffensive", () => {
    const phase = { id: "d3", at: 0, type: "phase" as const, scope: "loop", label: "démarrage" };
    expect(isEntryVisibleIn(phase, "c1")).toBe(false);
    expect(isEntryVisibleIn(phase, "c2")).toBe(false);
    expect(isEntryVisibleIn(phase, undefined)).toBe(false);
    // Même une entrée d'outil au mapping VIDE : ce qui décide est l'attribution, plus le
    // contenu. Estampillée, la même entrée s'affiche (cas suivant).
    const empty = { id: "d4", at: 0, type: "tool" as const, name: "t", ok: true, pairs: [] };
    expect(isEntryVisibleIn(empty, "c1")).toBe(false);
    expect(isEntryVisibleIn({ ...empty, conv: "c1" }, "c1")).toBe(true);
  });

  it("une entrée ESTAMPILLÉE ne se voit que dans sa conversation, mapping ou pas", () => {
    const e = { id: "d5", at: 0, conv: "c1", type: "tool" as const, name: "n", ok: true, pairs };
    expect(isEntryVisibleIn(e, "c1")).toBe(true);
    expect(isEntryVisibleIn(e, "c2")).toBe(false);
    expect(isEntryVisibleIn(e, undefined)).toBe(false);
  });
});
