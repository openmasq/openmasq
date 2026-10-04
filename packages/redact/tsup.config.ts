import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/documents/documents.ts",
    "src/documents/browser.ts",
    "src/viewer/pdfRedact.ts",
    "src/viewer/imageRedact.ts",
    "src/documents/inplace.ts",
    "src/remote/remote.ts",
    "src/local/ner.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // The monorepo build keeps its maps (the app's bundle and its Sentry traces read `dist/`);
  // the npm tarball ships none — they were two thirds of it. `prepack` rebuilds with
  // REDACT_PUBLISH=1, `postpack` rebuilds the maps: no `sourceMappingURL` points at a file
  // the tarball lacks.
  sourcemap: !process.env.REDACT_PUBLISH,
  target: "node18",
  // The NER inference deps (transformers.js + onnxruntime) are optional — they are
  // lazy-`import()`ed at runtime and must never be bundled here (the consumer
  // installs + supplies them, like pdf.js for the viewer). Optional PEERS are external
  // by default; `tesseract2.js` is only a devDependency (unpublished), so it is listed
  // explicitly — bundled, its `worker_threads` Worker started via `__dirname` breaks.
  external: ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web", "tesseract2.js"],
  // The brand values are INLINED: the published package must not depend on the private
  // `@openmasq/branding` workspace, and `branding.json` stays their one home (rule 9).
  noExternal: ["@openmasq/branding"],
});
