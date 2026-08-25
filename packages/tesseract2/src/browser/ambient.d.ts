// Browser/worker ambient declarations (included ONLY by tsconfig.browser.json, which
// compiles with `types: []` to avoid @types/node ⇄ DOM duplicate-global conflicts).

// `importScripts` is a Web Worker global not in the DOM lib.
declare function importScripts(...urls: string[]): void;

// `Buffer` is referenced ONLY behind `typeof Buffer !== 'undefined'` guards in the shared
// core (bytes.ts) — that whole branch is dead in the browser. Typed `any` so the guarded
// Node-only calls type-check without modelling the Node Buffer API (there is no @types/node
// in the browser build).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Buffer: any;
