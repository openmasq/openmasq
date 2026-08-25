import { coreVariants } from '../core/simd';
import type { CoreFactory } from '../core/tess';

/*
 * Loads the right tesseract.js-core build for this CPU/V8. The core always comes
 * from the installed package — there is deliberately no `corePath` override (in
 * tesseract.js's browser build that option loaded and executed arbitrary remote
 * scripts). `require.resolve` checks existence WITHOUT executing the Emscripten
 * factory, so a variant a given tesseract.js-core major doesn't ship (e.g. v6.1
 * has no `relaxedsimd`) is skipped instead of throwing MODULE_NOT_FOUND.
 */
let core: CoreFactory | null = null;

/* eslint-disable global-require, @typescript-eslint/no-var-requires */
function firstAvailableCore(candidates: string[]): CoreFactory {
  for (const name of candidates) {
    try {
      require.resolve(name);
    } catch {
      continue; // not shipped by this tesseract.js-core version — try the next
    }
    return require(name) as CoreFactory;
  }
  throw new Error(
    `tesseract.js-core: no usable core build found (tried: ${candidates.join(', ')}).`,
  );
}

export default function getCore(lstmOnly: boolean): CoreFactory {
  if (core !== null) return core;
  const candidates = coreVariants(lstmOnly).map((name) => `tesseract.js-core/${name}`);
  core = firstAvailableCore(candidates);
  return core;
}
