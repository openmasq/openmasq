import { describe, it, expect } from "vitest";
import katex from "katex";
import { KATEX_OPTIONS, normalizeMath } from "./katex";

describe("normalizeMath", () => {
  it("converts \\(…\\) and \\[…\\] to $ / $$ delimiters", () => {
    expect(normalizeMath("inline \\(a+b\\) here")).toBe("inline $a+b$ here");
    expect(normalizeMath("block \\[x^2\\] end")).toBe("block $$x^2$$ end");
  });

  it("leaves math delimiters inside code spans/blocks untouched", () => {
    expect(normalizeMath("`\\(a\\)`")).toBe("`\\(a\\)`");
    expect(normalizeMath("```\n\\[x\\]\n```")).toBe("```\n\\[x\\]\n```");
  });

  it("is a no-op on text with no math", () => {
    expect(normalizeMath("just prose")).toBe("just prose");
  });
});

/**
 * The math we typeset is MODEL output: an injected page can dictate a formula
 * verbatim, so KaTeX's document-author defaults are the wrong ones. These pin the
 * three that matter — the app renders through `KATEX_OPTIONS` and nothing else.
 */
describe("KATEX_OPTIONS — les bornes sur des maths écrites par le modèle", () => {
  const HUGE = String.raw`\rule{9999999em}{9999999em}`;
  /** KaTeX echoes the SOURCE verbatim in `<annotation encoding="application/x-tex">`.
   *  That copy is inert text, never geometry — assert on what is actually LAID OUT. */
  const rendered = (tex: string): string =>
    katex
      .renderToString(tex, { ...KATEX_OPTIONS })
      .replace(/<annotation[\s\S]*?<\/annotation>/g, "");

  it("borne la taille d'un élément : `\\rule` démesuré est ramené à maxSize", () => {
    // maxSize par défaut = Infinity : la boîte sortait à 9999999em et détruisait la mise
    // en page de la bulle (et de la conversation autour).
    const html = rendered(HUGE);
    expect(html).not.toContain("9999999em");
    expect(html).toContain(`width="${KATEX_OPTIONS.maxSize}em"`);
    // Toute longueur émise reste sous le plafond.
    const ems = [...html.matchAll(/(\d+(?:\.\d+)?)em/g)].map((m) => Number(m[1]));
    expect(ems.length).toBeGreaterThan(0);
    for (const em of ems) expect(em).toBeLessThanOrEqual(KATEX_OPTIONS.maxSize);
  });

  it("garde `trust` explicitement faux — pas de \\href/\\url fabriqué par le modèle", () => {
    expect(KATEX_OPTIONS.trust).toBe(false);
    const html = rendered(String.raw`\href{https://attaquant.example}{cliquer}`);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("attaquant.example");
  });

  it("borne l'expansion de macros (le « billion laughs » de TeX)", () => {
    expect(KATEX_OPTIONS.maxExpand).toBe(1000);
    // throwOnError:false ⇒ l'expansion bornée rend une erreur INERTE, jamais une boucle.
    expect(typeof rendered(String.raw`\def\a{\a}\a`)).toBe("string");
  });

  it("reste inerte sur du LaTeX partiel (les maths arrivent en streaming)", () => {
    expect(KATEX_OPTIONS.throwOnError).toBe(false);
    expect(() => katex.renderToString(String.raw`\frac{1`, { ...KATEX_OPTIONS })).not.toThrow();
  });
});
