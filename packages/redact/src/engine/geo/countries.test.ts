import { describe, it, expect } from "vitest";
import { isCountry, fakeCountry } from "./countries";
import { fakeFor } from "../../model/fakes";

describe("isCountry", () => {
  it("recognises FR / EN / native country spellings, case- + accent-insensitive", () => {
    for (const c of ["France", "france", "FRANCE", "Allemagne", "Germany", "Deutschland", "España", "Royaume-Uni", "États-Unis", "USA"]) {
      expect(isCountry(c)).toBe(true);
    }
  });
  it("does NOT flag cities / regions / empty", () => {
    for (const c of ["Évreux", "Paris", "New York", "Normandie", "Bretagne", ""]) {
      expect(isCountry(c)).toBe(false);
    }
  });
});

describe("fakeCountry", () => {
  it("always returns a DIFFERENT country (never the same, never a city)", () => {
    for (const v of ["France", "Belgique", "Allemagne", "Germany", "Spain"]) {
      for (let a = 0; a < 5; a++) {
        const f = fakeCountry(v, a * 101 + 7);
        expect(isCountry(f)).toBe(true);
        expect(f.toLowerCase()).not.toBe(v.toLowerCase());
      }
    }
  });
  it("keeps the input's language (an English country → an English, accent-free country)", () => {
    for (const v of ["Germany", "Spain", "Italy", "Sweden"]) {
      for (let a = 0; a < 5; a++) {
        expect(/[À-ÿ]/.test(fakeCountry(v, a))).toBe(false);
      }
    }
  });
  it("follows the original casing (ALL-CAPS → ALL-CAPS)", () => {
    const f = fakeCountry("FRANCE", 3);
    expect(f).toBe(f.toUpperCase());
  });
});

describe("fakeFor LOCATION — city vs country differentiation", () => {
  it("fakes a CITY to a city (never a country)", () => {
    for (const city of ["Évreux", "Paris", "Rennes"]) {
      for (let a = 0; a < 4; a++) {
        expect(isCountry(fakeFor("LOCATION", city, a))).toBe(false);
      }
    }
  });
  it("fakes a COUNTRY to a country (never a city)", () => {
    for (const country of ["France", "Belgique", "Allemagne", "Germany"]) {
      for (let a = 0; a < 4; a++) {
        expect(isCountry(fakeFor("LOCATION", country, a))).toBe(true);
      }
    }
  });
});

describe("les nations du Royaume-Uni — la clause de droit applicable", () => {
  // « governed by the law of England and Wales » est LA clause de droit applicable des
  // contrats anglophones. « England » et « Scotland » étaient reconnues, « Wales » non :
  // la clause devenait « England and <une commune française> », et le modèle raisonnait
  // sur le droit d'un endroit qui n'a pas de droit. Sur-protéger a coûté la réponse.
  it("reconnaît les quatre nations, dans les écritures qu'un contrat porte", () => {
    for (const n of [
      "England", "Scotland", "Wales", "Northern Ireland",
      "Angleterre", "Écosse", "Pays de Galles", "Irlande du Nord",
      "WALES", "wales", "Cymru",
    ]) {
      expect(isCountry(n)).toBe(true);
    }
  });

  it("ne les émet JAMAIS comme faux — le vivier reste celui des États", () => {
    for (const src of ["France", "Germany", "Belgique", "Spain"]) {
      for (let a = 0; a < 60; a++) {
        expect(["wales", "cymru", "pays de galles", "northern ireland", "irlande du nord"])
          .not.toContain(fakeCountry(src, a).toLowerCase());
      }
    }
  });
});
