import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * TWO themes, and the bare `:root` is one of them.
 *
 * `styles.css` declares the light theme under the BARE `:root` — the indigo accent, the
 * neutral ink — and the dark one under `[data-theme="dark"]`. Nothing else: the accent is
 * not a setting (`state/settings/theme.ts`), so a surface that loads this sheet without
 * naming a theme gets the product's light theme, not a skeleton. This pins the contract
 * the tests measuring contrast rely on (`contrast.test.ts`, `textContrast.test.ts` iterate
 * exactly these two), and refuses the retired accent-bearing names coming back.
 */
const CSS = readStylesheet();

/** Custom properties declared in every block whose selector list is exactly `selector`,
 *  later declarations winning — the resolved sheet inlines the partials, so a theme's
 *  tokens are spread over several blocks (`a11y.css` re-declares four of them). */
function varsOf(selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < CSS.length; ) {
    const open = CSS.indexOf("{", i);
    if (open === -1) break;
    const selList = CSS.slice(CSS.lastIndexOf("}", open) + 1, open);
    const close = CSS.indexOf("}", open);
    if (close === -1) break;
    if (!selList.includes("@") && selList.split(",").some((s) => s.trim() === selector)) {
      for (const m of CSS.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        vars[m[1]] = m[2].trim().toLowerCase();
      }
    }
    i = open + 1;
  }
  return vars;
}

describe("la feuille connaît deux thèmes", () => {
  it("le `:root` nu porte l'accent du produit — pas un squelette", () => {
    // Hardcoded on purpose: it is the VALUE we want to see arrive on screen, and reading
    // it back from the same declaration would prove nothing.
    expect(varsOf(":root")["--brand"]).toBe("#3939fa");
  });

  it("`[data-theme=\"dark\"]` existe et re-pointe le fond ET l'accent", () => {
    const dark = varsOf('[data-theme="dark"]');
    expect(dark["--surface-page"]).toBe("#0e0f13");
    expect(dark["--brand"]).toBe("#5252ff");
  });

  it("aucun sélecteur ne nomme un thème retiré", () => {
    expect(CSS).not.toMatch(/\[data-theme="(blue|blue-dark|light)"\]/);
  });
});
