import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Un commentaire CSS mal fermé ne fait PAS échouer le build — il avale silencieusement
 * les règles qui suivent, jusqu'à la fermeture suivante. Le symptôme n'apparaît qu'à
 * l'écran, des semaines plus tard, et se lit comme un bug de mise en page.
 *
 * Deux fois de suite dans `styles.css` :
 *  1. le retrait de l'ancien niveau « Navigation » a emporté la fermeture de son
 *     commentaire — `.privacy-level-head` est resté commenté, et l'en-tête de chaque
 *     carte de niveau a perdu son `display:flex` sans que rien ne le signale ;
 *  2. le commentaire qui documentait CE bug contenait une séquence de fermeture
 *     littérale dans sa prose, ce qui l'a refermé à la deuxième ligne — et a réavalé
 *     la même règle.
 *
 * Les deux sont invisibles à la relecture et au typecheck. Ce test les rend impossibles.
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

/** Balaie le texte comme un parseur CSS : pas d'imbrication, la 1ʳᵉ fermeture ferme. */
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

  // Le scanner doit ATTRAPER les deux formes réelles, sinon il ne garantit rien.
  it("le scanner attrape bien les deux formes qui ont mordu", () => {
    expect(scan("/* jamais fermé\n.a { color: red; }").openedAt).toBe(1);
    expect(scan("/* prose avec */ une fermeture */\n.a { color: red; }").orphanClosesAt).toEqual([1]);
    expect(scan("/* sain */\n.a { color: red; }")).toEqual({ openedAt: null, orphanClosesAt: [] });
  });
});
