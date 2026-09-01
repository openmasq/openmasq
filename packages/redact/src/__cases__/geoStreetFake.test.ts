import { describe, it, expect } from "vitest";
import { fakeGeo } from "../engine/geo";

/* A STREET must get a street fake.

   On the notarial deed, the NER tagged « rue \n Villa Ancelle » as a generic
   LOCATION. The geo branch had no case for that and the caller fell back to a
   CITY name: the model read « a property located at LORIENT (56100) 31 avignon » — an
   address that means nothing, in the document where the address was the useful information.

   Nothing leaked: the fake did protect the real street. But a fake that wrecks the sentence
   costs the document without buying anything more. */

const H = 12345;

describe("faux géographique — la forme suit la valeur", () => {
  it("donne un faux de RUE à une voie, avec ou sans numéro", () => {
    for (const v of ["rue Villa Ancelle", "avenue des Ternes", "Place de la Bourse"]) {
      const f = fakeGeo("LOCATION", v, H)!;
      expect(f, v).toBeTruthy();
      expect(f, `${v} → ${f}`).toMatch(/rue|avenue|impasse|chemin|boulevard|place|all[ée]e|quai/i);
      // No invented number: the document didn't carry one.
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
    // « ST OUEN » made an earlier version of the pattern match on the abbreviation « st ».
    // The city was then faked into « 96 IMPASSE DE LA FONTAINE, 29000 Quimper » —
    // a missed street is a clumsy fake, a city read as a street is a WRONG fake.
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
