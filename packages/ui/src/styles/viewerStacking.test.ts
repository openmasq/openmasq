import { describe, expect, it } from "vitest";
import { readStylesheet } from "./readStylesheet";

// The view menu of the preview modal drops out of `.fv-corner`, which is its stacking
// context: everything the viewer body lifts must sit BELOW that box, or the open menu
// slides under the PDF page strip / the halo legend.
const css = readStylesheet();
const zOf = (sel: string): number => {
  const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, s]) => s.split(",").some((x) => x.trim() === sel));
  const z = rule?.[2].match(/z-index:\s*(\d+)/)?.[1];
  if (!z) throw new Error(`no z-index on ${sel}`);
  return Number(z);
};

describe("the preview's view menu stays on top", () => {
  for (const sel of [".pdfv-bar", ".pdfv-halolegend"]) {
    it(`.fv-corner clears ${sel}`, () => {
      expect(zOf(".fv-corner")).toBeGreaterThan(zOf(sel));
    });
  }
});
