import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `getDocument` in this package hands pdf.js an UNTRUSTED document, so every one of
 * them must turn the two dangerous opt-ins off:
 *
 *  - `isEvalSupported` (pdf.js default: TRUE) lets the library compile font and colour
 *    programs found IN THE FILE via `Function(…)`. In the renderer that is arbitrary code
 *    beside the whole vault; in `main` it is arbitrary code with the app's privileges.
 *  - `enableXfa` switches on the XFA sub-parser — a second, far less exercised format we
 *    never display.
 *
 * Four of the five call sites carried `isEvalSupported: false`; `viewer/pdfRedact.ts`
 * called `getDocument({ data })` bare, and nothing said so — the divergence is invisible
 * to typecheck and to every behavioural test, because the option only changes what a
 * HOSTILE file can do. So this reads the SOURCE: it holds for the sites that exist today
 * and for the sixth one somebody adds, which a per-site mock never would.
 */
const SRC = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.ts$/.test(nom) && !/\.test\.ts$/.test(nom) ? [chemin] : [];
  });
}

/** Each `getDocument({ … })` call in the package, as `[relative file, options text]`. */
function callSites(): { file: string; options: string }[] {
  const out: { file: string; options: string }[] = [];
  for (const file of sources(SRC)) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/getDocument\(\{([\s\S]*?)\}\)/g)) {
      out.push({ file: file.slice(SRC.length), options: m[1] });
    }
  }
  return out;
}

describe("pdf.js — les options de sécurité de CHAQUE getDocument", () => {
  it("trouve bien les cinq points d'appel (sinon le test passerait à vide)", () => {
    const files = callSites()
      .map((c) => c.file)
      .sort();
    expect(files).toEqual([
      "documents/browser.ts",
      "documents/browser.ts",
      "documents/node.ts",
      "ocr/pdf.ts",
      "viewer/pdfRedact.ts",
    ]);
  });

  it("désactive `isEvalSupported` partout — un PDF hostile ne choisit pas du code à exécuter", () => {
    const manquants = callSites().filter((c) => !/isEvalSupported:\s*false/.test(c.options));
    expect(manquants.map((c) => c.file)).toEqual([]);
  });

  it("le peintre du visualiseur porte aussi `enableXfa: false`", () => {
    // Le point d'appel qui les avait perdus : il rend des octets déposés, dans le renderer.
    const viewer = callSites().find((c) => c.file === "viewer/pdfRedact.ts")!;
    expect(viewer.options).toMatch(/isEvalSupported:\s*false/);
    expect(viewer.options).toMatch(/enableXfa:\s*false/);
  });
});
