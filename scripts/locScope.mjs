/**
 * QUELS fichiers la règle 1 (cap de 300 lignes) gouverne — la définition, une seule fois.
 *
 * Deux gates la lisent : `check-file-size.mjs` (l'arbre entier, en CI) et
 * `check-staged-loc.mjs` (le pre-commit, sur l'index). Ils l'écrivaient chacun de leur
 * côté et avaient DIVERGÉ : le pre-commit ne connaissait pas l'exclusion des tests, si
 * bien qu'il refusait un commit que la CI accepte — un `.test.ts` déjà au-dessus du cap
 * bloquait toute session qui y ajoutait une régression, c'est-à-dire précisément le
 * geste qu'on veut encourager. Un gate plus strict que sa règle apprend à passer outre.
 */

/** OÙ elle s'applique : le code de PRODUIT. `check:loc` ne liste que ces deux racines,
 *  le pre-commit gouvernait tout l'index — la même divergence, dans l'autre sens : il
 *  refusait des fichiers hors produit (des maquettes CSS de la source de design que
 *  la CI n'a jamais gouvernées) et poussait à committer avec `--no-verify`. */
export const LOC_ROOTS = /^(apps|packages)\//;

/** Extensions gouvernées par le cap. */
export const LOC_EXTS = /\.(ts|tsx|css)$/;

/** Hors périmètre : les tests (une régression de plus doit toujours pouvoir s'écrire),
 *  les déclarations générées, les migrations DB et les
 *  sorties de build — tous légitimement non bornés ou générés. */
export const LOC_EXCLUDE =
  /\.test\.(ts|tsx)$|\.d\.ts$|\/migrations\/|\/dist\/|\/node_modules\//;

/** True quand ce chemin est soumis au cap. */
export function inLocScope(file) {
  return LOC_ROOTS.test(file) && LOC_EXTS.test(file) && !LOC_EXCLUDE.test(file);
}
