import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "@openmasq/llm",
    "@openmasq/redact",
    // Markdown stack — let the consumer's bundler handle these (they're ESM).
    "react-markdown",
    "remark-gfm",
    "remark-math",
    "rehype-katex",
    "katex",
    // pdf.js is heavy + uses a Web Worker resolved via the consumer's bundler
    // (`?url`); keep it external so the desktop's Vite handles bundling + worker.
    /^pdfjs-dist/,
    // pdf-lib bakes the in-memory redacted PDF; external → desktop Vite bundles it.
    "pdf-lib",
    // Office-doc renderers (spreadsheet + docx + pptx viewers). Heavy + lazy-
    // imported at view time; external so the consumer's bundler code-splits them.
    "xlsx",
    /^mammoth/,
    "fflate",
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
