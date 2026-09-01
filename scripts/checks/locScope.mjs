/**
 * WHICH files rule 1 (the 300-line cap) governs — the definition, once.
 *
 * Two gates read it: `check-file-size.mjs` (the whole tree, in CI) and
 * `check-staged-loc.mjs` (the pre-commit, on the index). They each wrote it on their own
 * side and had DIVERGED: the pre-commit did not know about the test exclusion, so it
 * refused a commit CI accepts — a `.test.ts` already over the cap blocked any session
 * adding a regression to it, which is precisely the gesture we want to encourage. A gate
 * stricter than its rule teaches people to bypass it.
 */

/** WHERE it applies: PRODUCT code. `check:loc` lists only these two roots, while the
 *  pre-commit governed the whole index — the same divergence, the other way round: it
 *  refused files outside the product (CSS mock-ups from the design source that CI never
 *  governed) and pushed people to commit with `--no-verify`. */
export const LOC_ROOTS = /^(apps|packages)\//;

/** Extensions governed by the cap. */
export const LOC_EXTS = /\.(ts|tsx|css)$/;

/** Out of scope: tests (one more regression must always be writable), generated
 *  declarations, DB migrations and build output — all legitimately unbounded or
 *  generated. */
export const LOC_EXCLUDE =
  /\.test\.(ts|tsx)$|\.d\.ts$|\/migrations\/|\/dist\/|\/node_modules\//;

/** True when this path is subject to the cap. */
export function inLocScope(file) {
  return LOC_ROOTS.test(file) && LOC_EXTS.test(file) && !LOC_EXCLUDE.test(file);
}
