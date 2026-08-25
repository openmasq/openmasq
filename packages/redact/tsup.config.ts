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
  sourcemap: true,
  target: "node18",
  // The NER inference deps (transformers.js + onnxruntime) are optional — they are
  // lazy-`import()`ed at runtime and must never be bundled here (the consumer
  // installs + supplies them, like pdf.js for the viewer).
  external: ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web"],
});
