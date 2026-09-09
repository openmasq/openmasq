import { describe, expect, it } from "vitest";
import { isMalformedEntity } from "./shapeGates";

describe("shape gates on a free-form entity", () => {
  it("refuses what a NER read out of Markdown or code", () => {
    for (const v of ["` slug. Link liberally", "slug. Link liberally", "<user>", "a\nb", "x | y"])
      expect(isMalformedEntity(v), v).toBe(true);
  });

  /** The gate must never cost a real name: hyphenated places and companies, initials, a
   *  particle, an accent — and a SLUG (`camille-roussel`), which is how a person's name
   *  travels in a URL or a handle and which the identity machinery must keep seeing. */
  it("lets every real shape through", () => {
    for (const v of [
      "Saint-Étienne", "Rolls-Royce", "Jean-Pierre Martin", "J. R. R. Tolkien", "d'Artagnan",
      "Société Générale", "3M", "Camille Berlioz", "Acme Inc.", "Rebour & Fils", "St. Louis",
      "Mr. Smith", "Rebour et Cie.", "camille-roussel", "path-cleaning-rules",
    ])
      expect(isMalformedEntity(v), v).toBe(false);
  });
});
