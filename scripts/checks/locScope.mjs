/**
 * WHICH files rule 1 (the 300-line cap) governs — the definition, once, for both gates
 * (`check-file-size.mjs` on the tree in CI, `check-staged-loc.mjs` on the index before a
 * commit). A gate stricter than its rule teaches people to bypass it.
 */

/** WHERE it applies: PRODUCT code. */
export const LOC_ROOTS = /^(apps|packages)\//;

/** Extensions governed by the cap. */
export const LOC_EXTS = /\.(ts|tsx|css)$/;

/** Out of scope: tests (one more regression must always be writable), generated
 *  declarations, DB migrations and build output. */
export const LOC_EXCLUDE =
  /\.test\.(ts|tsx)$|\.d\.ts$|\/migrations\/|\/dist\/|\/node_modules\//;

/** True when this path is subject to the cap. */
export function inLocScope(file) {
  return LOC_ROOTS.test(file) && LOC_EXTS.test(file) && !LOC_EXCLUDE.test(file);
}
