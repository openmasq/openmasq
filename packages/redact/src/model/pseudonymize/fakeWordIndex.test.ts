import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";
import { buildFakeWordIndex } from "./fakeWordIndex";

/* Régression d'un incident réel : un drop de CSV mint «20000 Ajaccio», «…76000 Rouen» et
   «Hugo» ; la passe suivante (injection mémoire, même vault) mint «Ajaccio», «Rouen» et
   «hugo» comme faux AUTONOMES d'autres valeurs. Le modèle répond sur la géographie fictive
   du CSV, et la un-redaction réécrit son «Rouen (76000)» en «Paris (76000)». Un mot = une
   identité, c'est l'invariant épinglé ici. */

describe("FakeWordIndex — le prédicat", () => {
  const idx = buildFakeWordIndex({
    "40 avenue Victor Hugo, 76000 Rouen": "59 Rue Alexandre Duval, 35000 Rennes",
    "20000 Ajaccio": "35760 Rennes",
    "Hugo": "Amrok",
    "60000 Beauvais": "94800 Villejuif",
  });

  it("rejette un faux autonome égal à un mot d'un faux existant (l'incident)", () => {
    expect(idx.clashes("Ajaccio", "Vitry surSeine")).toBe(true);
    expect(idx.clashes("Rouen", "Paris")).toBe(true);
  });

  it("rejette dans l'AUTRE sens : un faux long avalant un faux court existant", () => {
    expect(idx.clashes("12 rue d'Ajaccio, 20000 Ajaccio", "8 rue des Prés, 44000 Nantes")).toBe(true);
  });

  it("insensible à la casse — «hugo» pendant que «Hugo» est pris (wordTaken)", () => {
    expect(idx.wordTaken("hugo")).toBe(true);
    expect(idx.wordTaken("HUGO")).toBe(true);
  });

  it("EXEMPTE le même lieu — la cohérence de bloc géo est voulue", () => {
    // «Beauvais» seul pour le réel «Villejuif» pendant que «60000 Beauvais» couvre
    // «94800 Villejuif» : les deux réels décrivent la même place, un-redaction correct.
    expect(idx.clashes("Beauvais", "Villejuif")).toBe(false);
    // Le même mot pour un réel SANS rapport reste un clash — le cas de corruption.
    expect(idx.clashes("Beauvais", "F. Faure")).toBe(true);
  });

  it("n'indexe pas les mots-outils qui se répètent entre faux PAR CONSTRUCTION", () => {
    // «avenue», «rue», «saint»… se partagent entre adresses fictives sans ambiguïté :
    // jamais clé de vault à eux seuls, donc jamais un-redacted seuls.
    expect(idx.clashes("96 avenue de la Gare", "13 Bd de Beaumont, 35000 Rennes")).toBe(false);
  });

  it("un mot inédit ne clashe pas", () => {
    expect(idx.clashes("Bastia", "Quimper")).toBe(false);
    expect(idx.wordTaken("Marceline")).toBe(false);
  });
});

describe("allocateur — l'invariant tient de bout en bout", () => {
  it("aucun faux minté ne partage un mot distinctif avec les faux d'une passe PRÉCÉDENTE", async () => {
    // Le vault arrive chargé des faux d'un drop antérieur (la situation de l'incident).
    const vault: Record<string, string> = {
      "40 avenue Victor Hugo, 76000 Rouen": "59 Rue Alexandre Duval, 35000 Rennes",
      "20000 Ajaccio": "35760 Rennes",
      "Hugo": "Amrok",
    };
    const before = new Set(Object.keys(vault));
    const preIdx = buildFakeWordIndex(vault);
    // Une passe qui mint des lieux et des noms nouveaux, quel que soit le tirage du faussaire.
    await pseudonymize(
      "Le rendez-vous est fixé à Vitry-sur-Seine avec Maroussia Delrieux, puis retour à Paris chez M. Vernaux.",
      { vault },
    );
    for (const [fake, real] of Object.entries(vault)) {
      if (before.has(fake)) continue;
      expect(preIdx.clashes(fake, real), `«${fake}» réutilise un mot déjà en service`).toBe(false);
    }
  });
});
