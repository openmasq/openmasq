import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * TOUTE surface qui charge cette feuille doit NOMMER son thème.
 *
 * `styles.css` déclare le squelette clair sous `:root` NU — le skin VERT, retiré du
 * produit (`state/theme.ts` : `blueAccent` traduit tout thème persisté vers l'indigo) —
 * et l'accent réel sous `[data-theme]`. L'app de bureau pose l'attribut avant le premier
 * rendu (`applyPersistedTheme`), ce qui rend le squelette inatteignable CHEZ ELLE. Les
 * consoles web, elles, ne montent jamais ce store : sans attribut sur `<html>` elles
 * rendaient le vert (brand forêt, encre citron, liens et focus verts) face à des kits
 * indigo. Rien dans leur code ne pouvait le dire — d'où ce test, et son unique home ici,
 * à côté des jetons dont il parle (les apps ne s'important pas entre elles, un test posé
 * dans l'une n'aurait pas pu couvrir l'autre).
 *
 * Il lit le TEXTE des documents racine : l'attribut y est un littéral, et le rendre
 * n'apprendrait rien de plus que le lire.
 */
const CSS = readStylesheet();

/** Le document racine de chaque console — celui qui porte le `<html>`. */
const ROOTS = [
  ["apps/web (console d'administration)", "../../../../apps/web/index.html"],
] as const;

/** The LAST `--name` declared in a block of CSS (later wins), lowercased. */
function declared(css: string, name: string): string | undefined {
  const all = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, "g"))];
  return all.length ? all[all.length - 1][1].trim().toLowerCase() : undefined;
}

/** The body of the bare `[data-theme="<name>"] { … }` rule, not its descendant rules. */
function themeBlock(name: string): string {
  return new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
}

describe.each(ROOTS)("%s — l'accent du produit", (_label, path) => {
  const src = readFileSync(new URL(path, import.meta.url), "utf8");
  const theme = /<html[^>]*\sdata-theme="([^"]+)"/.exec(src)?.[1];

  it("pose un `data-theme` sur <html>", () => {
    expect(theme, "aucun data-theme : la console rendrait le squelette vert").toBeTruthy();
    expect(theme).not.toBe("light");
  });

  it("nomme un thème que la feuille déclare, et cet accent n'est pas le vert", () => {
    const block = themeBlock(theme!);
    expect(block, `[data-theme="${theme}"] n'existe pas dans styles.css`).not.toBe("");
    // L'accent indigo du produit. En dur : c'est la VALEUR qu'on veut voir arriver
    // jusqu'à l'écran, et la relire depuis le même `:root` ne prouverait rien (le
    // squelette vert satisferait sa propre déclaration).
    expect(declared(block, "--brand")).toMatch(/^#3939fa$/);
  });
});
