import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A conversation's ⋯ menu keeps its labels on ONE line — the invariant, pinned
 * on the sheet itself.
 *
 * `.header-menu` had a fixed width of 220 px. Once its 7 px of inner padding,
 * the border, the 11 px on either side of the item, the 15 px icon and
 * its 11 px gap are subtracted, only 156 px of text column were left. But « Supprimer la
 * conversation » needs 164 (measured at 13 px / Space Grotesk 500): three labels
 * out of four wrapped onto a second line, for eight missing pixels.
 *
 * The two declarations form a PAIR and only make sense together: `max-content`
 * sizes the menu on its longest label, `nowrap` forbids wrapping.
 * `nowrap` alone would overflow a fixed width; `max-content` alone would let the
 * browser break at the shortest. Hence this test rather than a comment, which no CI
 * reads — and because a layout regression wakes neither the typecheck nor
 * the unit tests.
 *
 * ⚠️ No `max-width` here, deliberately: the mobile skin re-presents this menu as a
 * full-width bottom sheet (`.app-mobile .header-menu`, styles/mobile/
 * chrome.css) and overrides ONLY `width`. A cap set on the base rule would
 * pinch it with nothing to flag it.
 */
const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

/** A rule's body, from its selector at the start of a line to the brace. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `règle \`${selector}\` absente`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("menu ⋯ de conversation — un libellé, une ligne", () => {
  it("le menu se dimensionne sur son plus long libellé, sans descendre sous 220 px", () => {
    const menu = rule(".header-menu");
    expect(menu, "une largeur figée re-casse les libellés en deux").toMatch(
      /width:\s*max-content/,
    );
    expect(menu).toMatch(/min-width:\s*220px/);
    expect(menu, "un plafond ici pincerait la feuille mobile pleine largeur").not.toMatch(
      /max-width:/,
    );
  });

  it("les actions ne reviennent jamais à la ligne", () => {
    expect(rule(".header-menu-item")).toMatch(/white-space:\s*nowrap/);
  });

  it("la peau mobile garde la main sur la largeur", () => {
    // If this override disappeared, `max-content` would take back over and the
    // bottom sheet would stop being full width.
    const mobile = readFileSync(join(__dirname, "mobile", "chrome.css"), "utf8");
    const at = mobile.indexOf(".app-mobile .header-menu {");
    expect(at, "surcharge mobile de `.header-menu` absente").toBeGreaterThan(-1);
    expect(mobile.slice(at, mobile.indexOf("}", at))).toMatch(/width:\s*auto/);
  });
});
