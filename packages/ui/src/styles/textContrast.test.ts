
import { readStylesheet } from "./readStylesheet";
import { describe, it, expect } from "vitest";

/**
 * The app's TEXT accessibility floor, measured rather than promised — the sibling of
 * `contrast.test.ts` (which measures the redaction palette). This one covers what every
 * screen uses: the ink tokens (body / link / muted / strong) on the surfaces they sit on,
 * and the primary-action button's ink on its brand fill, in ALL FOUR themes.
 *
 * Why it has to be computed: three of the four themes define `--text-link` as a
 * `color-mix(in oklch, …)`, so no one can eyeball whether a link stays readable after a
 * theme re-points the accent. And `--brand` genuinely INVERTS between themes (the
 * dark-green theme's brand IS the light lime the other themes write ON it), which is the
 * whole reason root rule 12 exists.
 *
 * ⚠️ The `color-mix(in oklch, …)` evaluation below is our own implementation of the CSS
 * interpolation (sRGB → OKLab → polar OKLch → back). It tracks the spec, but it is not
 * the browser's code: treat a result within ~0.1 of a threshold as undecided and check it
 * in a real browser rather than tuning the floor.
 */
// The RESOLVED sheet (styles.css + its `styles/` partials): reading styles.css alone
// made this sweep blind to every family already peeled out — see `readStylesheet.ts`.
const CSS = readStylesheet();

/** Every declaration block whose selector list mentions `selector`, in source order. */
function blocksFor(selector: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < CSS.length; ) {
    const open = CSS.indexOf("{", i);
    if (open === -1) break;
    const selList = CSS.slice(CSS.lastIndexOf("}", open) + 1, open);
    const close = CSS.indexOf("}", open);
    if (close === -1) break;
    if (!selList.includes("@") && selList.split(",").some((s) => s.trim() === selector)) {
      out.push(CSS.slice(open + 1, close));
    }
    i = open + 1;
  }
  return out;
}

function varsOf(selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const body of blocksFor(selector)) {
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const ROOT = varsOf(":root");
const THEMES: Record<string, Record<string, string>> = {
  light: {},
  dark: varsOf('[data-theme="dark"]'),
  blue: varsOf('[data-theme="blue"]'),
  "blue-dark": varsOf('[data-theme="blue-dark"]'),
};

// ── colour maths ────────────────────────────────────────────────────────────────
type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}
const toHex = (rgb: RGB): string =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

const srgbToLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB → OKLab (Björn Ottosson's matrices). */
function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, A, B]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ] as RGB;
}

/** `color-mix(in oklch, A p%, B)` — polar interpolation, shorter hue arc. A powerless
 *  hue (chroma ≈ 0, i.e. white/black/grey) adopts the other colour's hue, per spec. */
function mixOklch(aHex: string, pct: number, bHex: string): string {
  const [aL, aA, aB] = rgbToOklab(parseHex(aHex));
  const [bL, bA, bB] = rgbToOklab(parseHex(bHex));
  const polar = (A: number, B: number): [number, number] => [Math.hypot(A, B), Math.atan2(B, A)];
  const [aC, aH0] = polar(aA, aB);
  const [bC, bH0] = polar(bA, bB);
  const aH = aC < 1e-6 ? bH0 : aH0;
  const bH = bC < 1e-6 ? aH0 : bH0;
  let dH = bH - aH;
  while (dH > Math.PI) dH -= 2 * Math.PI;
  while (dH < -Math.PI) dH += 2 * Math.PI;
  const t = 1 - pct / 100; // pct is A's share
  const L = aL + (bL - aL) * t;
  const C = aC + (bC - aC) * t;
  const H = aH + dH * t;
  return toHex(oklabToRgb([L, C * Math.cos(H), C * Math.sin(H)]));
}

/** Resolve a token to a literal hex, following `var()` chains and evaluating a
 *  two-colour `color-mix(in oklch, …)` (the form this stylesheet uses). */
function resolve(name: string, theme: Record<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`token cycle at ${name}`);
  const raw = (theme[name] ?? ROOT[name])?.trim();
  if (!raw) throw new Error(`token ${name} is not defined`);
  return resolveValue(raw, theme, depth);
}

function resolveValue(raw: string, theme: Record<string, string>, depth = 0): string {
  if (depth > 10) throw new Error("value cycle");
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (ref) {
    try {
      return resolve(ref[1], theme, depth + 1);
    } catch {
      if (ref[2]) return resolveValue(ref[2].trim(), theme, depth + 1);
      throw new Error(`token → ${ref[1]} is not defined`);
    }
  }
  const mix = raw.match(/^color-mix\(\s*in\s+oklch\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i);
  if (mix) {
    return mixOklch(
      resolveValue(mix[1], theme, depth + 1),
      Number(mix[2]),
      resolveValue(mix[3], theme, depth + 1),
    );
  }
  throw new Error(`cannot resolve colour: ${raw}`);
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** WCAG 2.1 AA: normal text 4.5:1, large/bold text and UI boundaries 3:1. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/** The surfaces app text actually sits on.
 *  `--surface-shell` is the ground of the RAIL and the SIDEBAR — section labels,
 *  conversation titles, timestamps, the account block. It was the one ground nothing
 *  measured, which is how it could be re-toned per theme (each dark one, then the blue
 *  light one) with no check that the ink on it still reads. */
const SURFACES = [
  "--surface-page",
  "--surface-card",
  "--surface-sunken",
  "--surface-hover",
  "--surface-shell",
];

describe("ink tokens stay readable on every surface, in all four themes", () => {
  // `--text-faint` is IN: it carries timestamps, counts and metadata — meaning-bearing
  // text, so WCAG's normal-text floor applies to it like the rest. It used to measure
  // ~3.1-3.5:1 (worst case on `--surface-hover`) and was re-toned in OKLab, hue kept.
  for (const ink of ["--text-body", "--text-strong", "--text-link", "--text-muted", "--text-faint"]) {
    for (const [themeName, theme] of Object.entries(THEMES)) {
      for (const surface of SURFACES) {
        it(`${themeName}: ${ink} on ${surface}`, () => {
          const fg = resolve(ink, theme);
          const bg = resolve(surface, theme);
          const ratio = contrast(fg, bg);
          expect(
            ratio,
            `${themeName} ${ink} ${fg} on ${surface} ${bg} = ${ratio.toFixed(2)}:1 (AA needs ${AA_NORMAL})`,
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        });
      }
    }
  }
});

describe("the primary action button — its ink INVERTS with the brand", () => {
  // Root rule 12's exact scenario: `--brand` is a dark forest green in three themes and
  // the LIGHT LIME itself in the dark-green one, so any literal ink is wrong in one of
  // them. `--ink-on-brand` is the token that flips; this pins that it actually works.
  for (const [themeName, theme] of Object.entries(THEMES)) {
    it(`${themeName}: --ink-on-brand on --brand`, () => {
      const fg = resolve("--ink-on-brand", theme);
      const bg = resolve("--brand", theme);
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${themeName} ink ${fg} on brand ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  it("`.btn-primary` takes its ink from the INVERTING token, not a literal", () => {
    // The rule used to read `color: var(--lime, #fff)` and rely on a per-theme
    // `[data-theme="blue-dark"] .btn-primary` override to stay readable — two
    // declarations of one decision (rule 9), and the override missed `:disabled`.
    const decl = blocksFor(".btn-primary")
      .map((b) => b.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1]?.trim())
      .filter(Boolean);
    expect(decl.length, "`.btn-primary` must declare its ink").toBeGreaterThan(0);
    for (const c of decl) expect(c, "use var(--ink-on-brand)").toContain("--ink-on-brand");
  });
});

/**
 * LES BOUTONS PLEINS DE MARQUE — mesurés, pas promis (remonté par un utilisateur le 11/08 :
 * « le texte du bouton + Nouvelle conversation est noir »). Le bloc « Brand buttons carry
 * lime ink » peignait `color: var(--lime)` sur `background: var(--brand)`. Sur les thèmes
 * SOMBRES `--lime` vaut #11160b : du quasi-noir sur l'indigo, à 1,2:1. Rien ne le voyait —
 * la mesure ci-dessus ne porte que sur `--ink-on-brand`, et `.btn-new` déclarait bien ce
 * jeton-là… dans une règle que celle-ci écrasait, plus bas dans la feuille.
 */
describe("les boutons pleins de marque — l'encre qui GAGNE bascule avec le fond", () => {
  const BRAND_BUTTONS = [".btn-new", ".send-btn", ".primary", ".ob-next"];
  /** Les deux jetons qui basculent AVEC `--brand`. Tout le reste suit le fond de PAGE. */
  const INVERTING = ["--brand-contrast", "--ink-on-brand"];

  for (const [themeName, theme] of Object.entries(THEMES)) {
    it(`${themeName}: --brand-contrast on --brand`, () => {
      const fg = resolve("--brand-contrast", theme);
      const bg = resolve("--brand", theme);
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${themeName} ink ${fg} on brand ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  for (const sel of BRAND_BUTTONS) {
    it(`\`${sel}\` : la DERNIÈRE déclaration de couleur est un jeton inversant`, () => {
      // La dernière gagne, à spécificité égale — c'est exactement ce qui a mordu.
      const decls = blocksFor(sel)
        .map((b) => b.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1]?.trim())
        .filter(Boolean) as string[];
      expect(decls.length, `${sel} doit déclarer son encre`).toBeGreaterThan(0);
      const winning = decls[decls.length - 1];
      expect(
        INVERTING.some((t) => winning.includes(t)),
        `${sel} peint « ${winning} » sur un fond de marque — il faut ${INVERTING.join(" ou ")}`,
      ).toBe(true);
    });
  }

  it("le fond DOUX de la marque porte l'encre forte dans les quatre thèmes", () => {
    // `--brand-tint` est le survol de la carte « create » (compétences/workflows), dont le
    // libellé est `--text-strong`. Le jeton n'existait que sur les thèmes CLAIRS : les
    // sombres héritaient d'un pastel citron, sous un texte quasi-blanc.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      const fg = resolve("--text-strong", theme);
      const bg = resolve("--brand-tint", theme);
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${themeName} --text-strong ${fg} on --brand-tint ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe("the pearl badge pairs — each `--pearl-*-soft` fill with its own ink", () => {
  // The Avatar, `.cv-badge` and `.redaction-pill` write `--pearl-<name>-ink` on
  // `--pearl-<name>-soft`. The softs alias the `--hl-*-soft` pastels (light in all four
  // themes by documented invariant), so the inks stay dark everywhere — this measures
  // that the pairing actually clears AA wherever a theme moves. Literal inks
  // (#5b3bbf, #8a5a06…) used to sit here unmeasured; `frozenInk.test.ts` now bans the
  // literals and this pins the tokens that replaced them.
  const PEARLS = ["coral", "amber", "emerald", "azure", "violet", "magenta"] as const;
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const pearl of PEARLS) {
      it(`${themeName}: --pearl-${pearl}-ink on --pearl-${pearl}-soft`, () => {
        const fg = resolve(`--pearl-${pearl}-ink`, theme);
        const bg = resolve(`--pearl-${pearl}-soft`, theme);
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `${themeName} ink ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (AA needs ${AA_NORMAL})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

describe("the danger button's fixed white ink survives its fixed red", () => {
  it("white on --red-500 clears the large-text floor in every theme", () => {
    // `.btn-danger` writes a frozen `#fff` — allowed ONLY because its ground is a fixed
    // red that no theme re-points (rule 12's escape clause: a literal is fine when the
    // ground is literal too). If a theme ever re-tones `--red-500`, this fails.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      const ratio = contrast("#ffffff", resolve("--red-500", theme));
      expect(ratio, `${themeName}: white on red = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    }
  });
});

describe("the ink scale stays a SCALE — AA is a floor, not a flattening", () => {
  it("faint is still quieter than muted, which is still quieter than body", () => {
    // Raising `--text-faint` to AA is only correct if it remains the QUIET tone: a token
    // pushed until it matches `--text-muted` clears the floor and destroys the hierarchy
    // the three tokens exist to express.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      const bg = resolve("--surface-card", theme);
      const [faint, muted, body] = ["--text-faint", "--text-muted", "--text-body"].map((t) =>
        contrast(resolve(t, theme), bg),
      );
      expect(faint, `${themeName}: faint ${faint.toFixed(2)} vs muted ${muted.toFixed(2)}`).toBeLessThan(muted);
      expect(muted, `${themeName}: muted ${muted.toFixed(2)} vs body ${body.toFixed(2)}`).toBeLessThan(body);
    }
  });
});
