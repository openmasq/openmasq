/**
 * `browserStealth.ts` SERIALIZES `applyStealthPatches` (`.toString()`) and evaluates it in the
 * page's MAIN WORLD — a different realm, where only the function's TEXT arrives. Its
 * source states it in one line ("Self-contained — no closure refs"), and this is an invariant
 * nothing was checking: a module-scope binding that enters the body becomes a
 * nonexistent identifier there, the function throws, and its own `try/catch {}` swallows the error.
 * The patches stop applying WITHOUT A WORD — that's the most expensive form of this
 * bug, the one no log reports.
 *
 * This isn't theoretical: turning on `esbuild.keepNames` on the preload makes
 * esbuild inject a `__name(fn, "…")` INTO the body, whose helper is module-scoped.
 * Measured (`c(u,"applyStealthPatches")` in the bundle) — hence the ban in
 * `electron.vite.config.ts`, which THIS test guards.
 *
 * We re-read the BUILT bundle because a vite setting is an intention and only
 * the artifact is proof. Without a build, the cases get SKIPPED — `pnpm test` must stay
 * free and out-of-build; `verify.yml` runs `pnpm build` before the tests, so CI
 * runs them.
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
 * The source that's ACTUALLY serialized: the bundle ends with ``(${X.toString()})()``, so we
 * start from the minified name `X` and bound its declaration by counting braces. Going
 * by the original name wouldn't work — minification erased it, that's the whole point.
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

    // A context whose global intercepts everything: `has` always true makes every
    // bare identifier resolve on the proxy, and `get` RECORDS it before returning `undefined`. The read is
    // thus logged even when the function's `try/catch` swallows what follows — this is
    // precisely what makes this bug invisible in real execution.
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
      /* the function is bound to fail without a real DOM — only the ACCESSES matter to us */
    }

    // A browser global carries a long name (`navigator`, `Object`, `WebGLRenderingContext`);
    // a module binding that escaped a minifier is one or two letters. This is the
    // clean separation, and it requires no list of globals to keep up to date.
    const leaked = [...seen].filter((n) => n.length <= 2);
    expect(leaked, `identifiant(s) de portée module dans le corps sérialisé : ${leaked.join(", ")}`).toEqual([]);
  });
});
