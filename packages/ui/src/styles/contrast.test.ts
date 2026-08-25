
import { readStylesheet } from "./readStylesheet";
import { describe, it, expect } from "vitest";
import { SECTION_HUE } from "@openmasq/redact";

/**
 * The redaction palette's ACCESSIBILITY floor, measured rather than promised.
 *
 * Every redaction paints a value on its section's hue and writes the value ON that fill —
 * so the pair (`--hl-<hue>`, `--ink-on-hl-<hue>`) is the one place where a colour choice
 * can make the product's core surface unreadable. One generic ink is enough while every
 * hue is a pastel; the moment a palette turns saturated, white reads on some and near-black
 * on others, and the only way to keep that honest across four themes is to compute it.
 *
 * Two things make this test hard to bypass: it parses the REAL stylesheet, not a copy of the
 * values; and the hue list comes FROM `SECTION_HUE`, so adding a section's hue enrols it in
 * every case below automatically. Re-tone a hue and forget its ink — the change that looks
 * harmless in review — and CI says so.
 */
// Comments are stripped up front, not per-selector: this stylesheet's section banners
// contain commas and braces, and leaving them in makes any selector split lie.
// The RESOLVED sheet (styles.css + its `styles/` partials): reading styles.css alone
// made this sweep blind to every family already peeled out — see `readStylesheet.ts`.
const CSS = readStylesheet();

/** Derived from the palette's source — a new section hue is measured without an edit here. */
const HUES = [...new Set(Object.values(SECTION_HUE))];
/** WCAG 2.1 AA for normal-size text. Marks are 12–14px at weight 500 — normal text. */
const AA_NORMAL = 4.5;

/** Every declaration block whose selector list mentions `selector`, in source order. */
function blocksFor(selector: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < CSS.length; ) {
    const open = CSS.indexOf("{", i);
    if (open === -1) break;
    const selList = CSS.slice(CSS.lastIndexOf("}", open) + 1, open);
    // Skip at-rules (@media/@theme/@keyframes) — their inner blocks are matched on
    // their own, and a theme's tokens are never declared inside one.
    const close = CSS.indexOf("}", open);
    if (close === -1) break;
    if (!selList.includes("@") && selList.split(",").some((s) => s.trim() === selector)) {
      out.push(CSS.slice(open + 1, close));
    }
    i = open + 1;
  }
  return out;
}

/** Custom properties declared in those blocks, later declarations winning. */
function varsOf(selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const body of blocksFor(selector)) {
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim();
    }
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

/** Resolve a token to a literal colour, following `var()` chains (theme over :root). */
function resolve(name: string, theme: Record<string, string>, depth = 0): string {
  if (depth > 8) throw new Error(`token cycle at ${name}`);
  const raw = theme[name] ?? ROOT[name];
  if (!raw) throw new Error(`token ${name} is not defined`);
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (ref) {
    try {
      return resolve(ref[1], theme, depth + 1);
    } catch {
      if (ref[2]) return ref[2].trim();
      throw new Error(`token ${name} → ${ref[1]} is not defined`);
    }
  }
  return raw;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("redaction palette — contrast of every hue against its own ink", () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const hue of HUES) {
      it(`${themeName}: --hl-${hue} carries readable text`, () => {
        const fill = resolve(`--hl-${hue}`, theme);
        const ink = resolve(`--ink-on-hl-${hue}`, theme);
        const ratio = contrast(fill, ink);
        expect(
          ratio,
          `${themeName} --hl-${hue} ${fill} + ink ${ink} = ${ratio.toFixed(2)}:1 (AA needs ${AA_NORMAL})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  it("gives every hue an ink of its own — no silent reuse of the generic one", () => {
    // A hue re-toned without its ink is the regression this whole file exists for: the
    // generic `--ink-on-hl` is a DARK value, so a saturated new hue would inherit it and
    // go unreadable while every test above still passed on the other five.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      for (const hue of HUES) {
        expect(() => resolve(`--ink-on-hl-${hue}`, theme), `${themeName}/${hue}`).not.toThrow();
      }
    }
  });

  it("keeps every -soft tint mixed toward WHITE in the themed palette", () => {
    // The chat marks write `--ink-on-hl-soft` (dark) on `--hl-*-soft` fills. That is only
    // safe because the softs are LIGHT in every theme. The blue pair inherits the base
    // pastel softs today, but a theme may declare its own as a color-mix() (unresolvable
    // to hex here) — so the invariant is pinned STRUCTURALLY too: a mix takes its hue at
    // ≤40 % into #ffffff. A soft re-based on a surface token flips dark in blue-dark and
    // the dark ink vanishes with it.
    for (const themeName of ["blue", "blue-dark"] as const) {
      for (const hue of HUES) {
        const raw = THEMES[themeName][`--hl-${hue}-soft`] ?? ROOT[`--hl-${hue}-soft`];
        expect(raw, `${themeName} --hl-${hue}-soft`).toMatch(
          /^color-mix\(in oklch, #[0-9a-f]{6} (?:[1-3]?\d|40)%, #ffffff\)$|^#[0-9a-f]{6}$/i,
        );
      }
    }
    // And where the soft IS a plain hex (the light/dark pastels), measure the pairing.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      for (const hue of HUES) {
        const raw = theme[`--hl-${hue}-soft`] ?? ROOT[`--hl-${hue}-soft`];
        if (!/^#[0-9a-f]{6}$/i.test(raw ?? "")) continue;
        const ink = resolve(`--ink-on-hl-soft`, theme);
        const ratio = contrast(raw!, ink);
        expect(ratio, `${themeName} --hl-${hue}-soft + soft ink = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it("keeps the six families visually distinct within a theme", () => {
    // Two families sharing a fill is not a contrast bug, but it silently merges two
    // categories in the one UI whose whole job is telling them apart.
    for (const [themeName, theme] of Object.entries(THEMES)) {
      const fills = HUES.map((h) => resolve(`--hl-${h}`, theme).toLowerCase());
      expect(new Set(fills).size, `${themeName}: ${fills.join(" ")}`).toBe(HUES.length);
    }
  });
});
