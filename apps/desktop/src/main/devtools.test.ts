// La préférence `devTools` vaut PAR FENÊTRE : une fenêtre créée sans elle retombe sur le
// défaut d'Electron (`true`) sans que rien ne rougisse — et la septième fenêtre, celle
// qu'on ajoutera dans six mois, est exactement celle qui l'oubliera. Ce test scanne donc
// le main : tout fichier qui CRÉE une fenêtre ou une vue doit référencer `DEVTOOLS_PREF`.
// (Scan de texte, pas d'import : le module lit `app.isPackaged` à l'import, et c'est le
// même procédé que `clientApp.parity.test.ts` — un commentaire ne peut pas échouer en CI.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MAIN = dirname(fileURLToPath(import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) yield p;
  }
}

describe("toute fenêtre du main porte la politique DevTools", () => {
  it("aucun `new BrowserWindow` / `new WebContentsView` sans DEVTOOLS_PREF", () => {
    const oublis: string[] = [];
    for (const file of sources(MAIN)) {
      const src = readFileSync(file, "utf8");
      if (!/new (BrowserWindow|WebContentsView|BaseWindow)\(/.test(src)) continue;
      if (!src.includes("DEVTOOLS_PREF")) oublis.push(relative(MAIN, file));
    }
    expect(oublis, `fenêtre(s) sans politique DevTools — voir devtools.ts : ${oublis.join(", ")}`).toEqual([]);
  });
});
