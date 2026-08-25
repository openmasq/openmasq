/**
 * `browserStealth.ts` SÉRIALISE `applyStealthPatches` (`.toString()`) et l'évalue dans le
 * MONDE PRINCIPAL de la page — un autre realm, où seul le TEXTE de la fonction arrive. Sa
 * source le dit en une ligne (« Self-contained — no closure refs »), et c'est un invariant
 * que rien ne vérifiait : une liaison de portée module qui entre dans le corps y devient un
 * identifiant inexistant, la fonction jette, et son propre `try/catch {}` avale l'erreur.
 * Les patches cessent de s'appliquer SANS UN MOT — c'est la forme la plus coûteuse de ce
 * bug, celle qu'aucun log ne signale.
 *
 * Ce n'est pas théorique : activer `esbuild.keepNames` sur le preload fait injecter à
 * esbuild un `__name(fn, "…")` DANS le corps, dont l'assistant est de portée module.
 * Mesuré (`c(u,"applyStealthPatches")` dans le bundle) — d'où l'interdit dans
 * `electron.vite.config.ts`, dont CE test est la garde.
 *
 * On relit le bundle CONSTRUIT parce qu'un réglage vite est une intention et que seul
 * l'artefact est une preuve. Sans build, les cas se SAUTENT — `pnpm test` doit rester
 * gratuit et hors-build ; `verify.yml` lance `pnpm build` avant les tests, donc la CI les
 * exécute.
 */
import { describe, it, expect } from "vitest";
import { createContext, runInContext } from "node:vm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../out/preload");

function builtBundle(): string | null {
  if (!existsSync(outDir)) return null;
  const name = readdirSync(outDir).find((f) => /^browserStealth\.(js|mjs|cjs)$/.test(f));
  return name ? readFileSync(join(outDir, name), "utf8") : null;
}

/**
 * La source RÉELLEMENT sérialisée : le bundle finit par ``(${X.toString()})()``, donc on
 * repart du nom minifié `X` et on borne sa déclaration en comptant les accolades. Passer
 * par le nom d'origine ne marcherait pas — la minification l'a effacé, c'est le sujet.
 */
function serializedSource(bundle: string): string {
  const m = /\(\$\{(\w+)\.toString\(\)\}\)\(\)/.exec(bundle);
  expect(m, "l'appel qui sérialise la fonction a disparu du bundle").not.toBeNull();
  const name = m![1];

  const decl = new RegExp(`function\\s+${name}\\s*\\(`).exec(bundle);
  expect(decl, `\`${name}\` n'est plus une déclaration de fonction`).not.toBeNull();

  const start = decl!.index;
  let depth = 0;
  for (let i = bundle.indexOf("{", start); i < bundle.length; i++) {
    if (bundle[i] === "{") depth++;
    else if (bundle[i] === "}" && --depth === 0) return bundle.slice(start, i + 1);
  }
  throw new Error("corps de fonction non borné");
}

describe("browserStealth — la fonction sérialisée dans la page", () => {
  const bundle = builtBundle();

  it.skipIf(!bundle)("est du JS valide hors de son module", () => {
    const src = serializedSource(bundle!);
    expect(() => new Function(`return (${src})`)).not.toThrow();
  });

  it.skipIf(!bundle)("ne référence AUCUNE liaison de portée module", () => {
    const src = serializedSource(bundle!);

    // Un contexte dont le global intercepte tout : `has` toujours vrai fait résoudre chaque
    // identifiant nu sur le proxy, et `get` NOTE avant de rendre `undefined`. La lecture est
    // donc enregistrée même quand le `try/catch` de la fonction avale ce qui suit — c'est
    // précisément ce qui rend ce bug invisible en exécution réelle.
    const seen = new Set<string>();
    const ctx = createContext(
      new Proxy(Object.create(null), {
        has: () => true,
        get: (_t, p) => {
          if (typeof p === "string") seen.add(p);
          return undefined;
        },
      }),
    );
    try {
      runInContext(`(${src})()`, ctx);
    } catch {
      /* la fonction échoue forcément sans un vrai DOM — seuls les ACCÈS nous intéressent */
    }

    // Un global de navigateur porte un nom long (`navigator`, `Object`, `WebGLRenderingContext`) ;
    // une liaison de module rescapée d'un minifieur fait une ou deux lettres. C'est la
    // séparation nette, et elle ne demande pas de tenir à jour une liste de globaux.
    const leaked = [...seen].filter((n) => n.length <= 2);
    expect(leaked, `identifiant(s) de portée module dans le corps sérialisé : ${leaked.join(", ")}`).toEqual([]);
  });
});
