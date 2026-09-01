import { describe, it, expect } from "vitest";
import { valueShape, valueShapeFor } from "./valueShape";

describe("valueShape — la forme, jamais la valeur", () => {
  it("généralise casse, chiffres et lettres en gardant les séparateurs", () => {
    expect(valueShape("Jean-Pierre Rebour")).toBe("Xxxx-Xxxxxx Xxxxxx");
    expect(valueShape("jean.rebour@example.com")).toBe("xxxx.xxxxxx@xxxxxxx.xxx");
    expect(valueShape("06 12 34 56 78")).toBe("99 99 99 99 99");
    expect(valueShape("FR76 3000 6000")).toBe("XX99 9999 9999");
  });

  it("aucun caractère alphanumérique de la valeur ne survit", () => {
    const value = "Marie Curie 1867";
    const shape = valueShape(value);
    for (const ch of value) {
      if (/[\p{L}\p{N}]/u.test(ch)) expect(shape).not.toContain(ch);
    }
  });

  it("les blancs typographiques (NBSP) deviennent une espace simple", () => {
    expect(valueShape("12 34 56")).toBe("99 99 99");
  });

  it("une lettre sans casse (CJK) a son propre symbole — le script reste lisible", () => {
    expect(valueShape("张伟")).toBe("◌◌");
  });

  it("borne un gabarit long et dit la longueur réelle", () => {
    const out = valueShape("a".repeat(200));
    expect(out.length).toBeLessThan(70);
    expect(out).toContain("(200 car.)");
  });

  it("un secret/clé n'exporte MÊME PAS sa structure", () => {
    expect(valueShapeFor("sk_live_a8B!x", "apikey")).toBe("••• (13 car.)");
    expect(valueShapeFor("p@ssw0rd!", "secret")).toBe("••• (9 car.)");
    // …but an ordinary category keeps its shape.
    expect(valueShapeFor("Jean Rebour", "name")).toBe("Xxxx Xxxxxx");
  });

  it("valeur absente (trou de vault) : un symbole, pas une ligne vide", () => {
    expect(valueShapeFor("", "name")).toBe("∅");
  });
});
