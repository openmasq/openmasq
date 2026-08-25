import { describe, expect, it } from "vitest";
import { isGenericTerm } from "./genericTerms";

describe("jours et mois — jamais une entité à eux seuls", () => {
  /**
   * Journal du 04/08, sur une vraie boîte mail : « Sun » redacted en ORGANISATION,
   * « Thu » en LIEU. Ils sont dans l'en-tête `Date:` de chaque e-mail, en tête de ligne
   * et capitalisés — la forme même qu'un NER lit comme un nom propre. Le modèle recevait
   * « Ash, 02 Aug 2026 », dans une demande qui portait sur « les e-mails de la semaine ».
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
    // La discipline d'allow-list déjà pinnée par `aiKinds.test.ts` : quelqu'un s'appelle
    // Avril, June ou Mars, et l'écarter le laisserait en clair pour toujours. « mar » est
    // dehors pour la même raison (mars/March).
    for (const v of ["mars", "avril", "mai", "march", "april", "may", "june", "august", "mar"])
      expect(isGenericTerm(v), v).toBe(false);
  });

  it("ne touche pas à un nom qui COMMENCE par un mot de calendrier", () => {
    // Valeur ENTIÈRE seulement — sinon une vraie société disparaîtrait du filet.
    expect(isGenericTerm("Sun Microsystems")).toBe(false);
    expect(isGenericTerm("Friday Beers SAS")).toBe(false);
  });
});

/**
 * Journal du 15/08 — la doc de l'outil `execute-sql` (PostHog) partait REDACTED au
 * modèle : « ##### 1. System Data » lu comme un nom fabriquait les alias System/system, et
 * « entity » devenait un patronyme. `applyVault` réécrivait ensuite CHAQUE occurrence dans
 * la conversation, résultats d'outils compris — le modèle lisait une doc décrivant des
 * tables `ghislain.*` et écrivait du SQL contre elles. Même famille que « data »→« lucas »
 * et « UTC »→« HAL » déjà traités : le bloc couvrait data/schema/query, pas les deux mots
 * qui STRUCTURENT ces docs.
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
