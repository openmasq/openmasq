// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tonePaint, resetTonePaintCache, TONE_RGB, INK } from "./tonePaint";

/* Documents are painted on a <canvas>, which cannot carry a CSS class. The
   painter therefore long had its OWN frozen palette: re-toning the theme changed the
   chat's marks and left documents with the old colours. These tests pin the
   per-theme resolution AND the fallback. */

const setTheme = (theme: string | null, vars: Record<string, string> = {}) => {
  const root = document.documentElement;
  if (theme === null) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.style.cssText = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  resetTonePaintCache();
};

beforeEach(() => resetTonePaintCache());
afterEach(() => setTheme(null));

describe("tonePaint — la palette suit le thème", () => {
  it("résout le remplissage ET l'encre depuis les jetons du thème actif", () => {
    setTheme("blue", { "--hl-sky": "#3939fa", "--ink-on-hl-sky": "#ffffff" });
    // The painter reads the SAME tokens as the DOM's marks — never a frozen table.
    expect(tonePaint("sky")).toEqual({ fill: "#3939fa", ink: "#ffffff" });
  });

  it("chaque teinte porte SON encre — pas une encre unique pour toutes", () => {
    setTheme("blue", {
      "--hl-sky": "#3939fa", "--ink-on-hl-sky": "#ffffff",
      "--hl-slate": "#b3c2da", "--ink-on-hl-slate": "#0b0b0f",
    });
    // This is accessibility: white on a saturated blue, near-black on a light grey. The
    // current palette only has pastels, so ONE dark ink is enough — these tokens
    // exist for the palette where that stops being true, and the painter must follow them.
    expect(tonePaint("sky").ink).toBe("#ffffff");
    expect(tonePaint("slate").ink).toBe("#0b0b0f");
  });

  it("un nom de tone RETIRÉ peint la couleur de sa section aujourd'hui", () => {
    // A stored file's `replacements` carry a `tone`: records written
    // before the palette unification are on disk. « emerald » used to name the
    // Contact family — it now carries `sky`, not the default amber.
    setTheme("light", { "--hl-sky": "#6fc2ff", "--ink-on-hl-sky": "#0f1c06" });
    expect(tonePaint("emerald").fill).toBe("#6fc2ff");
    expect(tonePaint("coral").fill).not.toBe(`rgb(${TONE_RGB.amber.join(",")})`);
  });

  it("un changement de thème re-résout (le memo est keyé par thème)", () => {
    setTheme("light", { "--hl-sky": "#3ccfda", "--ink-on-hl-sky": "#0b0b0f" });
    expect(tonePaint("sky").fill).toBe("#3ccfda");
    setTheme("blue", { "--hl-sky": "#3939fa", "--ink-on-hl-sky": "#ffffff" });
    expect(tonePaint("sky").fill).toBe("#3939fa");
  });

  it("jeton absent → repli figé, JAMAIS une chaîne vide", () => {
    // An empty string would leave `fillStyle` unchanged: the box wouldn't cover the
    // real glyphs underneath — a real value would stay visible on the document.
    setTheme("light", {});
    const p = tonePaint("pink");
    const [r, g, b] = TONE_RGB.pink;
    expect(p.fill).toBe(`rgb(${r},${g},${b})`);
    expect(p.ink).toBe(INK);
    expect(p.fill).not.toBe("");
    expect(p.ink).not.toBe("");
  });

  it("tone inconnu → l'ambre, jamais du vide", () => {
    setTheme("light", {});
    expect(tonePaint("inexistant").fill).toBe(`rgb(${TONE_RGB.amber.join(",")})`);
  });
});
