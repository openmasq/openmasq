import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The HORIZONTAL overflow of the home screen, pinned — because a CSS regression
 * shows up neither at typecheck nor in a component's render.
 *
 * What happened: the starter cards clipped their prompt to ONE line with
 * `white-space: nowrap`. An unbreakable line gives the grid item an automatic
 * minimum size equal to its WHOLE SENTENCE: the `1fr` column then refuses to
 * shrink, and the whole home screen scrolls sideways (measured in the built app:
 * 911 px of content in a 560 column).
 *
 * Two halves of the same rule, hence two checks: the cap goes on the
 * HEIGHT (a number of lines), and every container in the chain sets `min-width: 0`.
 */
const css = readFileSync(join(__dirname, "starters.css"), "utf8");

/** A rule's body, by its exact selector. */
function block(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `sélecteur absent : ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("starters.css — l'accueil ne défile jamais latéralement", () => {
  it("l'invite est plafonnée en LIGNES, jamais rendue insécable", () => {
    const prompt = block(".om-starter-prompt");
    expect(prompt).not.toMatch(/white-space:\s*nowrap/);
    expect(prompt).toMatch(/-webkit-line-clamp:\s*\d/);
    expect(prompt).toMatch(/overflow:\s*hidden/);
  });

  it("chaque maillon de la chaîne pose `min-width: 0`", () => {
    // The card is the GRID item: without this zero, its minimum width stays that of
    // its content, whatever the column asks for.
    for (const sel of [".om-starter", ".om-starter-prompt"]) {
      expect(block(sel), sel).toMatch(/min-width:\s*0/);
    }
  });

  it("la carte tient sur UNE ligne — c'est ce qui borne la hauteur du bloc", () => {
    // Stacked, the card was 78 px and the block 538: the home screen overflowed at the bottom.
    expect(block(".om-starter")).toMatch(/align-items:\s*center/);
    expect(block(".om-starter")).not.toMatch(/flex-direction:\s*column/);
    expect(block(".om-starter-prompt")).toMatch(/line-clamp:\s*1/);
  });

  it("la rangée de puces passe à la ligne", () => {
    expect(block(".om-starter-chips")).toMatch(/flex-wrap:\s*wrap/);
  });

  // The other half of the same trap, on the CENTERING axis. `.welcome` centers its children,
  // so the starters block's width is that of its widest child: a chip row
  // longer than the grid widened the block, the grid (capped at 560) stuck
  // to the left and « Ne plus proposer » (right-aligned) went past the cards.
  // One single width for all children — measured in the built app: block, grid
  // and chip row share the same center as the greeting and the composer.
  it("le bloc d'amorces est borné à la largeur des cartes", () => {
    const wrap = block(".om-starters-wrap");
    const grid = block(".om-starters");
    const cap = /max-width:\s*(\d+)px/;
    expect(wrap).toMatch(cap);
    expect(cap.exec(wrap)![1]).toBe(cap.exec(grid)![1]);
  });
});
