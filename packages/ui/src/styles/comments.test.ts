import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A badly-closed CSS comment does NOT fail the build — it silently swallows
 * the rules that follow, up to the next closing. The symptom only shows up on
 * screen, weeks later, and reads like a layout bug.
 *
 * Twice in a row in `styles.css`:
 *  1. removing the old « Navigation » level took its comment's closing
 *     down with it — `.privacy-level-head` stayed commented out, and every level
 *     card's header lost its `display:flex` with nothing flagging it;
 *  2. the comment documenting THIS bug contained a literal closing
 *     sequence in its prose, which closed it at the second line — and re-swallowed
 *     the same rule.
 *
 * Both are invisible on review and at typecheck. This test makes them impossible.
 */

const STYLES_DIR = join(__dirname);
const ROOT_CSS = join(__dirname, "..", "styles.css");

function cssFiles(): { name: string; text: string }[] {
  const out = [{ name: "styles.css", text: readFileSync(ROOT_CSS, "utf-8") }];
  const walk = (dir: string, prefix: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
      else if (e.name.endsWith(".css"))
        out.push({ name: `${prefix}${e.name}`, text: readFileSync(join(dir, e.name), "utf-8") });
    }
  };
  walk(STYLES_DIR, "styles/");
  return out;
}

/** Scans the text like a CSS parser: no nesting, the 1st closing closes. */
function scan(text: string): { openedAt: number | null; orphanClosesAt: number[] } {
  let i = 0;
  let line = 1;
  let inComment = false;
  let openedAt: number | null = null;
  const orphanClosesAt: number[] = [];
  while (i < text.length) {
    if (text[i] === "\n") line++;
    if (!inComment && text.startsWith("/*", i)) {
      inComment = true;
      openedAt = line;
      i += 2;
      continue;
    }
    if (text.startsWith("*/", i)) {
      if (inComment) {
        inComment = false;
        openedAt = null;
      } else orphanClosesAt.push(line);
      i += 2;
      continue;
    }
    i++;
  }
  return { openedAt: inComment ? openedAt : null, orphanClosesAt };
}

describe("les commentaires CSS ne peuvent pas avaler une règle", () => {
  const files = cssFiles();

  it("le corpus balayé n'est pas vide (sinon ce test ne prouve rien)", () => {
    expect(files.length).toBeGreaterThan(1);
    expect(files.some((f) => f.name === "styles.css")).toBe(true);
  });

  it.each(files.map((f) => [f.name, f.text] as const))(
    "%s : aucun commentaire laissé ouvert",
    (name, text) => {
      const { openedAt } = scan(text);
      expect(openedAt, `${name} : commentaire ouvert ligne ${openedAt} et jamais refermé`).toBe(
        null,
      );
    },
  );

  it.each(files.map((f) => [f.name, f.text] as const))(
    "%s : aucune fermeture orpheline (le signe qu'une prose contient une fermeture)",
    (name, text) => {
      const { orphanClosesAt } = scan(text);
      expect(
        orphanClosesAt,
        `${name} : fermeture(s) de commentaire hors commentaire, ligne(s) ${orphanClosesAt.join(", ")}`,
      ).toEqual([]);
    },
  );

  // The scanner must CATCH both real-world shapes, or it guarantees nothing.
  it("le scanner attrape bien les deux formes qui ont mordu", () => {
    expect(scan("/* jamais fermé\n.a { color: red; }").openedAt).toBe(1);
    expect(scan("/* prose avec */ une fermeture */\n.a { color: red; }").orphanClosesAt).toEqual([1]);
    expect(scan("/* sain */\n.a { color: red; }")).toEqual({ openedAt: null, orphanClosesAt: [] });
  });
});
