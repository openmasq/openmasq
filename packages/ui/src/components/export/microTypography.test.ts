import { describe, it, expect } from "vitest";
import { frenchSpacing } from "./microTypography";

const NBSP = " ";

describe("frenchSpacing — des insécables, et RIEN d'autre", () => {
  it("soude la ponctuation haute et les guillemets", () => {
    expect(frenchSpacing("Vraiment ? Oui !")).toBe(`Vraiment${NBSP}? Oui${NBSP}!`);
    expect(frenchSpacing("deux points : ceci ; cela")).toBe(`deux points${NBSP}: ceci${NBSP}; cela`);
    expect(frenchSpacing("il dit « bonjour » fort")).toBe(`il dit «${NBSP}bonjour${NBSP}» fort`);
  });

  it("soude les milliers et les unités", () => {
    expect(frenchSpacing("12 000 raisons")).toBe(`12${NBSP}000 raisons`);
    expect(frenchSpacing("1 234 567 €")).toBe(`1${NBSP}234${NBSP}567${NBSP}€`);
    expect(frenchSpacing("45 % de 500 $")).toBe(`45${NBSP}% de 500${NBSP}$`);
  });

  it("ne touche PAS à ce qui n'est pas une espace française à souder", () => {
    // The golden rule: we replace an existing space, we never insert — so a
    // text with no space before its punctuation stays as-is (URL, smiley, English).
    for (const s of [
      "https://acme.example/page?x=1",
      "voir: le point collé reste collé",
      "un smiley :) et un ;(",
      "06 12 34 56 78", // phone: groups of 2, never fused as thousands
      "les années 2026 2027", // two numbers, not a grouping
      "What time is it?", // English punctuation already tight: nothing to do
    ]) {
      expect(frenchSpacing(s)).toBe(s);
    }
  });

  it("est idempotente — repasser ne change rien", () => {
    const once = frenchSpacing("Prix : 12 000 € !");
    expect(frenchSpacing(once)).toBe(once);
  });

  it("ne change JAMAIS la longueur ni les caractères non-espace", () => {
    // The property that makes the module safe, stated as such: only the NATURE
    // of existing spaces changes — not the content, not the length.
    const samples = ["Vraiment ? 12 000 € : oui ; « non » !", "texte 100 % ordinaire"];
    for (const s of samples) {
      const out = frenchSpacing(s);
      expect(out.length).toBe(s.length);
      expect(out.replace(new RegExp(NBSP, "g"), " ")).toBe(s);
    }
  });
});
