import { describe, it, expect } from "vitest";
import { summarizeMatches, engineLabel } from "./redactSummary";
import type { RedactionMatch } from "@openmasq/redact";

const m = (type: string, over: Partial<RedactionMatch> = {}): RedactionMatch =>
  ({ type, value: "jean@example.com", placeholder: "p", ...over }) as RedactionMatch;

describe("summarizeMatches — comptes et catégories, JAMAIS une valeur", () => {
  it("groupe par catégorie fine et compte les « à vérifier »", () => {
    const out = summarizeMatches([
      m("email"),
      m("email"),
      m("model", { category: "NAME", uncertain: true }),
    ]);
    expect(out).toContain("3 valeurs");
    expect(out).toContain("email×2");
    expect(out).toContain("(1 à vérifier)");
    expect(out).not.toContain("jean@example.com"); // JAMAIS une valeur dans le résumé
  });

  it("plafonne la liste pour rester une ligne", () => {
    const many = ["email", "phone", "iban", "card", "address", "path", "url", "ip"].map((t) => m(t));
    const out = summarizeMatches(many);
    expect(out).toContain("+2 cat.");
  });

  it("zéro détection se dit", () => {
    expect(summarizeMatches([])).toBe("0 valeur");
  });
});

describe("engineLabel", () => {
  it("nomme le moteur par priorité remote > modèle > local > règles", () => {
    expect(engineLabel(true, true, true)).toBe("remote");
    expect(engineLabel(false, true, true)).toBe("modèle");
    expect(engineLabel(false, false, true)).toBe("local");
    expect(engineLabel(false, false, false)).toBe("règles");
  });
});
