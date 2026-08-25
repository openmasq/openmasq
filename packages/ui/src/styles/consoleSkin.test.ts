import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * La console d'administration n'est PAS une surface de chat.
 *
 * `styles.css` aplatit le chat : `--border-subtle: transparent` et les ombres à `none`,
 * sur `.app` **et sur `#root`** — or `#root` est aussi le point de montage de la SPA
 * d'`apps/web`. La console héritait donc de la peau sans bordure : plus une seule
 * hairline, des cartes qui ne se distinguaient plus du panneau, là où le kit admin
 * (`.claude/skills/design-system/ui_kits/admin`) est fait de surfaces bordées. Aucun
 * typecheck ni test de rendu ne pouvait le voir — une couleur de bordure transparente
 * n'échoue nulle part, elle disparaît juste.
 *
 * Deux moitiés à tenir ensemble, d'où un seul test : la feuille doit EXCLURE la console,
 * et la console doit PORTER la marque. L'une sans l'autre ne fait rien.
 */
const CSS = readStylesheet();
const ADMIN_SHELL = readFileSync(
  new URL("../../../../apps/web/components/admin/shell/AdminShell.tsx", import.meta.url),
  "utf8",
);

describe("la peau sans bordure du chat épargne la console", () => {
  it("exclut `.om-console` du sélecteur qui neutralise hairlines et ombres", () => {
    const rule = /\.app,\s*\n\s*(#root[^{]*)\{([^}]*)\}/.exec(CSS);
    expect(rule, "la règle `.app, #root { … }` a changé de forme").toBeTruthy();
    expect(rule![1]).toContain(":not(:has(.om-console))");
    // Ce que la règle enlève, et donc ce que la console récupère en s'en excluant.
    expect(rule![2]).toMatch(/--border-subtle:\s*transparent/);
  });

  it("rend la couleur d'un lien de console à ses classes utilitaires", () => {
    // `a { color: var(--text-link) }` est HORS calque et bat donc tout utilitaire
    // Tailwind (calqué), quelle que soit la spécificité : la nav entière ressortait en
    // indigo. `revert-layer` rend la main aux calques inférieurs.
    expect(CSS).toMatch(/\.om-console a\s*\{\s*color:\s*revert-layer;?\s*\}/);
  });

  it("la coque de la console porte bien la marque", () => {
    expect(ADMIN_SHELL).toContain("om-console");
  });
});
