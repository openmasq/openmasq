// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tonePaint, resetTonePaintCache, TONE_RGB, INK } from "./tonePaint";

/* Les documents sont peints sur un <canvas>, qui ne peut pas porter de classe CSS. Le
   peintre a donc longtemps eu sa PROPRE palette figée : re-teinter le thème changeait les
   marques du chat et laissait les documents aux anciennes couleurs. Ces tests épinglent la
   résolution par thème ET le repli. */

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
    // Le peintre lit les MÊMES jetons que les marques du DOM — jamais une table figée.
    expect(tonePaint("sky")).toEqual({ fill: "#3939fa", ink: "#ffffff" });
  });

  it("chaque teinte porte SON encre — pas une encre unique pour toutes", () => {
    setTheme("blue", {
      "--hl-sky": "#3939fa", "--ink-on-hl-sky": "#ffffff",
      "--hl-slate": "#b3c2da", "--ink-on-hl-slate": "#0b0b0f",
    });
    // C'est l'accessibilité : blanc sur un bleu saturé, quasi-noir sur un gris clair. La
    // palette actuelle n'a que des pastels, donc UNE encre sombre suffit — ces jetons
    // existent pour la palette où ça cesse d'être vrai, et le peintre doit les suivre.
    expect(tonePaint("sky").ink).toBe("#ffffff");
    expect(tonePaint("slate").ink).toBe("#0b0b0f");
  });

  it("un nom de tone RETIRÉ peint la couleur de sa section aujourd'hui", () => {
    // Les `replacements` d'un fichier stocké portent un `tone` : des enregistrements écrits
    // avant l'unification de la palette sont sur le disque. « emerald » désignait la famille
    // Contact — elle porte `sky` désormais, pas de l'ambre par défaut.
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
    // Une chaîne vide laisserait `fillStyle` inchangé : la boîte ne couvrirait pas les
    // vrais glyphes en dessous — une valeur réelle resterait visible sur le document.
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
