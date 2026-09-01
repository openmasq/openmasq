import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * The admin console is NOT a chat surface.
 *
 * `styles.css` flattens the chat: `--border-subtle: transparent` and shadows set to `none`,
 * on `.app` **and on `#root`** — but `#root` is also the mount point of `apps/web`'s
 * SPA. The console therefore inherited the borderless skin: not a single
 * hairline left, cards no longer distinguishable from the panel, where the admin kit
 * (`.claude/skills/design-system/ui_kits/admin`) is made of bordered surfaces. No
 * typecheck nor render test could see it — a transparent border colour
 * fails nowhere, it just disappears.
 *
 * Two halves to hold together, hence a single test: the sheet must EXCLUDE the console,
 * and the console must CARRY the brand. One without the other does nothing.
 */
const CSS = readStylesheet();
// The console has lived in the private `infra` repo since 2026-08-31: without it alongside (the
// public repo), the « la console porte la marque » half has nothing to read — the
// « la feuille l'épargne » half stays verifiable, and it's the one that guards against the CSS regression.
const SHELL_URL = new URL("../../../../apps/web/components/admin/shell/AdminShell.tsx", import.meta.url);
const ADMIN_SHELL = existsSync(SHELL_URL) ? readFileSync(SHELL_URL, "utf8") : null;

describe("la peau sans bordure du chat épargne la console", () => {
  it("exclut `.om-console` du sélecteur qui neutralise hairlines et ombres", () => {
    const rule = /\.app,\s*\n\s*(#root[^{]*)\{([^}]*)\}/.exec(CSS);
    expect(rule, "la règle `.app, #root { … }` a changé de forme").toBeTruthy();
    expect(rule![1]).toContain(":not(:has(.om-console))");
    // What the rule removes, and hence what the console recovers by excluding itself from it.
    expect(rule![2]).toMatch(/--border-subtle:\s*transparent/);
  });

  it("rend la couleur d'un lien de console à ses classes utilitaires", () => {
    // `a { color: var(--text-link) }` is OUT OF LAYER and so beats any Tailwind
    // utility (layered), whatever the specificity: the whole nav came out
    // indigo. `revert-layer` hands the hand back to the lower layers.
    expect(CSS).toMatch(/\.om-console a\s*\{\s*color:\s*revert-layer;?\s*\}/);
  });

  it.skipIf(ADMIN_SHELL === null)("la coque de la console porte bien la marque", () => {
    expect(ADMIN_SHELL).toContain("om-console");
  });
});
