// Node ≥26 defines `localStorage`/`sessionStorage` as OWN getters on globalThis (an
// experimental Web Storage stub that returns `undefined` — with a warning — unless the
// process was started with `--localstorage-file`). Vitest's jsdom environment only copies a
// jsdom-window key onto the global when the global does NOT already own it, so under Node 26
// every `// @vitest-environment jsdom` test sees Node's undefined stub instead of jsdom's
// Storage — `localStorage.clear()` throws and the whole eval suite dies, on a machine and in
// CI (`node-version: 26`) alike, while Node ≤24 is unaffected.
//
// Fix: in a jsdom test (and only there — `document` exists), when the storage global is not
// usable, graft REAL jsdom Storage instances over the stubs. A fresh JSDOM window supplies
// them (same implementation the environment would have provided), so semantics — per-file
// isolation included, since setup files run once per test file — match what the tests were
// written against. Delete this file (and its `setupFiles` entry) once vitest overrides Node's
// stubs itself.
// ⚠️ `jsdom` is imported LAZILY, and that is a performance contract, not a style choice.
// A setup file runs once per TEST FILE — all ~475 of them, of which only ~34 are jsdom.
// A top-level `import { JSDOM } from "jsdom"` therefore paid jsdom's (large) module graph
// in every pure-Node file that will never touch it, and it dominated the whole suite:
// `setup` alone was 237 s of the redact package's 89 s wall. Keep the import inside the
// branch — and inside the "actually unusable" check, so even a jsdom file that needs no
// graft pays nothing.
if (typeof document !== "undefined") {
  const missing = (["localStorage", "sessionStorage"] as const).filter((key) => {
    try {
      return typeof globalThis[key]?.getItem !== "function";
    } catch {
      return true; // Node's stub can throw on access — treat as unusable
    }
  });
  if (missing.length) {
    const { JSDOM } = await import("jsdom");
    const storageWindow = new JSDOM("", { url: "http://localhost/" }).window;
    for (const key of missing) {
      Object.defineProperty(globalThis, key, {
        value: storageWindow[key],
        writable: true,
        configurable: true,
      });
    }
  }
}
