import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * **Hovering a conversation must resize NOTHING.** The row swaps two elements
 * on its right edge — the time fades out, the ⋯ menu appears — and the swap has already
 * happened twice at the cost of a jump:
 *
 *  • in HEIGHT: an `IconButton` measures 30 px where the row at rest is 20, so placed
 *    in flow it pushed the row +10 px under the cursor;
 *  • in WIDTH: `display: none` on the time gave its 46 px back to the title, which widened.
 *
 * Neither shows up in a typecheck or a jsdom render (nothing there has a dimension), and
 * the second one came back via a redeclaration left at the end of the sheet, lower in the
 * cascade than the correct rule. Hence this test on the RESOLVED sheet, which reads what wins.
 */
const CSS = readStylesheet();

/** The blocks whose selector mentions `.conv-time` under a `:hover`/`:focus-within`. */
function hoverTimeBlocks(): string[] {
  const out: string[] = [];
  const re = /([^{}]*\.conv-time[^{}]*)\{([^}]*)\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) {
    if (/:hover|:focus-within/.test(m[1])) out.push(m[2]);
  }
  return out;
}

describe("ligne de conversation — le survol ne change aucune dimension", () => {
  it("efface l'heure sans rendre sa place au titre", () => {
    const blocks = hoverTimeBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      expect(body).toMatch(/visibility:\s*hidden/);
      // The redeclaration that brought the bug back.
      expect(body).not.toMatch(/display:\s*none/);
    }
  });

  it("sort le menu ⋯ du flux, pour qu'il ne puisse pas grandir la ligne", () => {
    const decl = /\.conv-actions\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(decl).toMatch(/position:\s*absolute/);
    expect(/\.conv-item\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "").toMatch(/position:\s*relative/);
  });
});
