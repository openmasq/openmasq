import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * A console page (`.om-console`) is NOT a chat surface.
 *
 * The sheet flattens the chat — `--border-subtle: transparent`, shadows `none` — on `.app`
 * AND on `#root`, and `#root` is also where a console page mounts. A console is made of
 * bordered surfaces, so it must be EXCLUDED from that skin: a transparent border colour
 * fails no typecheck and no render test, it just disappears.
 */
const CSS = readStylesheet();

describe("la peau sans bordure du chat épargne la console", () => {
  it("exclut `.om-console` du sélecteur qui neutralise hairlines et ombres", () => {
    const rule = /\.app,\s*\n\s*(#root[^{]*)\{([^}]*)\}/.exec(CSS);
    expect(rule, "la règle `.app, #root { … }` a changé de forme").toBeTruthy();
    expect(rule![1]).toContain(":not(:has(.om-console))");
    // What the rule removes, and hence what the console recovers by excluding itself from it.
    expect(rule![2]).toMatch(/--border-subtle:\s*transparent/);
  });

  it("rend la couleur d'un lien de console à ses classes utilitaires", () => {
    // `a { color: var(--text-link) }` is OUT OF LAYER and so beats any Tailwind utility
    // (layered), whatever the specificity. `revert-layer` hands back to the lower layers.
    expect(CSS).toMatch(/\.om-console a\s*\{\s*color:\s*revert-layer;?\s*\}/);
  });
});
