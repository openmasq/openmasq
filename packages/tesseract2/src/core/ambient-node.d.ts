// Node-only ambient declarations (included ONLY by tsconfig.node.json; the browser build
// gets `WebAssembly` from the DOM lib instead — see tsconfig.browser.json).

// `WebAssembly.validate` is a Node runtime global but is NOT in the `ES2022` lib and not
// provided by `@types/node`, so `core/simd.ts`'s SIMD feature detection wouldn't type-check.
declare namespace WebAssembly {
  function validate(bytes: Uint8Array | ArrayBuffer): boolean;
}

/*
 * tesseract.js-core ships no TypeScript types; each build entry exports an
 * Emscripten factory function. Node loads them with `require(...)`.
 */
declare module 'tesseract.js-core/*' {
  import type { CoreFactory } from './tess';

  const factory: CoreFactory;
  export = factory;
}
