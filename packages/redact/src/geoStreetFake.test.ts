import { describe, it, expect } from "vitest";
import { fakeGeo } from "./engine/geo";

/* Une RUE doit recevoir un faux de rue.

   Sur l'attestation notariale, le NER a étiqueté « rue \n Villa Ancelle » comme un LOCATION
   générique. La branche géo n'avait pas de cas pour ça et l'appelant retombait sur un nom
   de VILLE : le modèle a lu « un bien sis à LORIENT (56100) 31 avignon » — une adresse qui
   ne veut rien dire, dans le document où l'adresse était l'information utile.

   Rien n'a fui : le faux protégeait bien la vraie rue. Mais un faux qui détruit la phrase
   coûte le document sans rien acheter de plus. */

const H = 12345;

describe("faux géographique — la forme suit la valeur", () => {
  it("donne un faux de RUE à une voie, avec ou sans numéro", () => {
    for (const v of ["rue Villa Ancelle", "avenue des Ternes", "Place de la Bourse"]) {
      const f = fakeGeo("LOCATION", v, H)!;
      expect(f, v).toBeTruthy();
      expect(f, `${v} → ${f}`).toMatch(/rue|avenue|impasse|chemin|boulevard|place|all[ée]e|quai/i);
      // Pas de numéro inventé : le document n'en portait pas.
      expect(/\d/.test(f), `${v} → ${f} ne doit pas inventer de numéro`).toBe(false);
    }
    const avecNum = fakeGeo("LOCATION", "31 rue Villa Ancelle", H)!;
    expect(avecNum).toMatch(/^\d+\s/);
  });

  it("traverse un saut de ligne — c'est la forme que l'OCR produit", () => {
    const f = fakeGeo("LOCATION", "rue\n                       Villa Ancelle", H)!;
    expect(f).toMatch(/rue|avenue|impasse|chemin|boulevard/i);
  });

  it("⚠️ ne prend PAS une ville pour une rue", () => {
    // « ST OUEN » a fait matcher une première version du motif sur l'abréviation « st ».
    // La ville était alors faussée en « 96 IMPASSE DE LA FONTAINE, 29000 Quimper » —
    // une rue manquée est un faux maladroit, une ville lue comme une rue est un faux FAUX.
    for (const v of ["ST OUEN (93400)", "Saint-Étienne", "Bruyères", "Villa Ancelle"]) {
      const f = fakeGeo("LOCATION", v, H)!;
      expect(f, `${v} → ${f}`).not.toMatch(/^\d*\s*(?:rue|avenue|impasse|chemin|boulevard)/i);
    }
  });

  it("reste dans la langue du pays", () => {
    expect(fakeGeo("LOCATION", "Via Roma", H)).toMatch(/via|piazza|corso|viale/i);
  });

  it("ne change rien à une ADRESSE complète, qui routait déjà bien", () => {
    expect(fakeGeo("ADDRESS", "31 rue Villa Ancelle", H)).toMatch(/^\d+\s/);
  });
});
