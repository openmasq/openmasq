import { describe, expect, it } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * A masked span in the composer reads in its HUE's ink, in both themes.
 *
 * The mark's band sits behind the textarea, so if the textarea painted its own glyphs a
 * redacted span would carry the FIELD's ink — white on a pastel band in the dark theme. The
 * glyphs are therefore painted by the backdrop (`.composer-highlight`), the textarea keeps
 * only caret, selection and input, and `.composer-mark` gives its span `--mk-ink`. The pair
 * (`--hl-*`, `--ink-on-hl-*`) is measured by `contrast.test.ts`; this pins the wiring.
 */
const CSS = readStylesheet();

/** Declarations of every plain rule whose selector list contains exactly `selector`. */
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].includes("@") || !m[1].split(",").some((s) => s.trim() === selector)) continue;
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

describe("composer marks take the hue's ink", () => {
  it("the textarea paints no glyph, only the caret", () => {
    const input = declarations(".composer-input");
    expect(input.color).toBe("transparent");
    expect(input["caret-color"]).toBe("var(--text-strong)");
  });

  it("the backdrop is the copy you read", () => {
    expect(declarations(".composer-highlight").color).toBe("var(--text-strong)");
  });

  it("a mark writes its span in the hue's ink", () => {
    expect(declarations(".composer-mark").color).toMatch(/^var\(--mk-ink\b/);
  });

  it("no dark-theme rule paints the field's text back", () => {
    for (const m of CSS.matchAll(/([^{}]*\[data-theme="dark"\][^{}]*)\{([^{}]*)\}/g)) {
      if (!/\.composer-input\b/.test(m[1])) continue;
      expect(m[2]).not.toMatch(/(^|;)\s*color\s*:/);
    }
  });
});
