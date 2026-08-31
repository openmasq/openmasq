import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";
import { buildFakeWordIndex } from "./fakeWordIndex";

/* Regression from a real incident: a CSV drop mints «20000 Ajaccio», «…76000 Rouen» and
   «Hugo»; the next pass (memory injection, same vault) mints «Ajaccio», «Rouen» and
   «hugo» as STANDALONE fakes of other values. The model answers about the CSV's
   fictional geography, and de-redaction rewrites its «Rouen (76000)» into «Paris (76000)». One word = one
   identity, that's the invariant pinned here. */

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
    // «Beauvais» alone for the real «Villejuif» while «60000 Beauvais» covers
    // «94800 Villejuif»: both reals describe the same place, correct de-redaction.
    expect(idx.clashes("Beauvais", "Villejuif")).toBe(false);
    // The same word for an UNRELATED real stays a clash — the corruption case.
    expect(idx.clashes("Beauvais", "F. Faure")).toBe(true);
  });

  it("n'indexe pas les mots-outils qui se répètent entre faux PAR CONSTRUCTION", () => {
    // «avenue», «rue», «saint»… are shared between fake addresses without ambiguity:
    // never a vault key on their own, so never de-redacted on their own.
    expect(idx.clashes("96 avenue de la Gare", "13 Bd de Beaumont, 35000 Rennes")).toBe(false);
  });

  it("un mot inédit ne clashe pas", () => {
    expect(idx.clashes("Bastia", "Quimper")).toBe(false);
    expect(idx.wordTaken("Marceline")).toBe(false);
  });
});

describe("allocateur — l'invariant tient de bout en bout", () => {
  it("aucun faux minté ne partage un mot distinctif avec les faux d'une passe PRÉCÉDENTE", async () => {
    // The vault arrives already loaded with fakes from an earlier drop (the incident's situation).
    const vault: Record<string, string> = {
      "40 avenue Victor Hugo, 76000 Rouen": "59 Rue Alexandre Duval, 35000 Rennes",
      "20000 Ajaccio": "35760 Rennes",
      "Hugo": "Amrok",
    };
    const before = new Set(Object.keys(vault));
    const preIdx = buildFakeWordIndex(vault);
    // A pass that mints new places and names, whatever the faker's draw.
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
