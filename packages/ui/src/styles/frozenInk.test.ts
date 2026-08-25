import { relative } from "node:path";
import { describe, it, expect } from "vitest";
import { stylesheetFiles } from "./readStylesheet";

/**
 * Root rule 12, SWEPT instead of promised: no declaration block may freeze its text
 * ink as a `#hex` literal while its ground is a token a theme re-points. The named
 * pins (`textContrast.test.ts` on `.btn-primary`) caught one button; this walks the
 * whole resolved sheet, because the audited regressions (`.send-btn`, `.btn-new`,
 * `.welcome-actions`, `.primary`, `.ver-btn.primary`, the tone badges…) were each the
 * SAME bug in a block nothing measured: `color: #fff` on `var(--brand)` reads 1.29:1
 * in the dark-green theme, whose brand IS the light lime.
 *
 * A literal that is truly needed (rule 12's escape clause) must be verified in all
 * FOUR themes and SAY so, with a CSS comment carrying the marker `theme-checked` on
 * the declaration's line — that marker is the one derogation this sweep honours.
 *
 * Scope: grounds using `--brand*`, `--hl-*`, `--surface-*`, `--pearl-*` — the token
 * families themes re-point (or that carry a paired ink of their own). A literal ground
 * beside a literal ink is legal (nothing inverts under it), which is why the sweep
 * keys on the BACKGROUND being tokened, not on the ink alone.
 */

/** Token families a theme re-points — an ink frozen over one of these is the bug. */
const THEMED_GROUND = /var\(--(?:brand|hl-|surface-|pearl-)/;

type Offence = { selector: string; value: string; line: string };

/** Every `color: #hex` declared in a block whose background uses a themed token. */
function frozenInkOffences(css: string): Offence[] {
  // Keep line structure: a derogation is per-LINE, so non-marker comments become
  // their own newlines and marker comments collapse to a single-line marker.
  const marked = css.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.includes("theme-checked") ? "/*theme-checked*/" : c.replace(/[^\n]/g, ""),
  );
  const out: Offence[] = [];
  // Innermost blocks only: a body never contains braces, so rules nested in an
  // at-rule match on their own and the at-rule prelude never pairs with a body.
  for (const block of marked.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    const body = block[2];
    const grounds = [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)];
    if (!grounds.some((g) => THEMED_GROUND.test(g[1]))) continue;
    for (const decl of body.matchAll(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) {
      const at = decl.index! + decl[0].length;
      const line = body.slice(body.lastIndexOf("\n", at) + 1, at + 200).split("\n")[0];
      if (line.includes("theme-checked")) continue;
      out.push({ selector, value: decl[1], line: line.trim() });
    }
  }
  return out;
}

/** Pastel grounds that do NOT flip with the theme (one definition, four themes). */
const PASTEL_GROUND = /var\(--(?:hl-|pearl-)/;
/** Text tokens that DO flip with the theme — frozen over a pastel, they go invisible. */
const FLIPPING_INK = /var\((--text-[a-z-]+)\)/;

/** Every `color: var(--text-*)` declared in a block on an `--hl-*`/`--pearl-*` ground. */
function flippingInkOffences(css: string): Offence[] {
  const marked = css.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.includes("theme-checked") ? "/*theme-checked*/" : c.replace(/[^\n]/g, ""),
  );
  const out: Offence[] = [];
  for (const block of marked.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    const body = block[2];
    const grounds = [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)];
    // A `transparent` WASH (color-mix over transparent) shows the ambient surface,
    // which flips WITH the theme — a flipping text ink is correct there.
    if (!grounds.some((g) => PASTEL_GROUND.test(g[1]) && !/transparent/.test(g[1]))) continue;
    for (const decl of body.matchAll(/(?:^|;)\s*color\s*:\s*(var\(--text-[a-z-]+\))/g)) {
      if (!FLIPPING_INK.test(decl[1])) continue;
      const at = decl.index! + decl[0].length;
      const line = body.slice(body.lastIndexOf("\n", at) + 1, at + 200).split("\n")[0];
      if (line.includes("theme-checked")) continue;
      out.push({ selector, value: decl[1], line: line.trim() });
    }
  }
  return out;
}

describe("no frozen ink on a themed ground (rule 12) — the whole sheet, every partial", () => {
  it("declares no `color: #hex` beside a `--brand`/`--hl-*`/`--surface-*`/`--pearl-*` fill", () => {
    const offences: string[] = [];
    for (const { file, text } of stylesheetFiles()) {
      for (const o of frozenInkOffences(text)) {
        offences.push(`${relative(process.cwd(), file)} → ${o.selector} → color: ${o.value}`);
      }
    }
    expect(
      offences,
      "A literal ink on a token the themes re-point goes invisible in one of them — " +
        "use the ink that INVERTS with the fill (--ink-on-brand, --ink-on-hl[-hue], " +
        "--pearl-*-ink, --text-*), or verify the literal in all four themes and mark " +
        "the line `/* theme-checked */`:\n" +
        offences.join("\n"),
    ).toEqual([]);
  });

  it("declares no FLIPPING text token on a `--hl-*`/`--pearl-*` pastel — token-on-wrong-token", () => {
    // The hex sweep above misses the token-shaped variant of the same bug: the
    // `--hl-*(-soft)` / `--pearl-*-soft` pastels are IDENTICAL in all four themes
    // (ui/CLAUDE.md invariant), while every `--text-*` ink FLIPS near-white in dark —
    // so `color: var(--text-strong)` over `--hl-amber-soft` reads ~1.2:1 in dark.
    // That exact pair shipped on `.fv-coverage-note`, the document preview's coverage
    // WARNING (audit 2026-08-10). The paired inks are `--ink-on-hl[-hue]` /
    // `--pearl-*-ink`; same per-line `theme-checked` derogation as the hex sweep.
    const offences: string[] = [];
    for (const { file, text } of stylesheetFiles()) {
      for (const o of flippingInkOffences(text)) {
        offences.push(`${relative(process.cwd(), file)} → ${o.selector} → color: ${o.value}`);
      }
    }
    expect(
      offences,
      "A --text-* ink flips with the theme but a --hl-*/--pearl-* pastel does not — " +
        "use the paired ink (--ink-on-hl[-hue], --pearl-*-ink), or mark the line " +
        "`/* theme-checked */`:\n" + offences.join("\n"),
    ).toEqual([]);
  });

  it("the sweep itself still bites — a seeded literal is caught, a derogation is honoured", () => {
    // Guards the scanner against regex rot: if this stops flagging, the sweep above is
    // silently passing on nothing.
    const bad = `.x { background: var(--brand); color: #fff; }`;
    expect(frozenInkOffences(bad)).toHaveLength(1);
    const excused = `.x { background: var(--brand); color: #fff; /* theme-checked */ }`;
    expect(frozenInkOffences(excused)).toHaveLength(0);
    const literalGround = `.x { background: #d9f2f5; color: #0e6b7a; }`;
    expect(frozenInkOffences(literalGround)).toHaveLength(0);
    const tokenInk = `.x { background: var(--hl-pink); color: var(--ink-on-hl); }`;
    expect(frozenInkOffences(tokenInk)).toHaveLength(0);
    // `border-color`/`background-color` never masquerade as the text ink.
    const notInk = `.x { background: var(--surface-card); border-color: #fff; }`;
    expect(frozenInkOffences(notInk)).toHaveLength(0);
  });
});
