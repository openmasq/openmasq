import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Runs in browsers (extension), Electron, Capacitor WebView and Node 20 — all
  // expose the WebCrypto SubtleCrypto + fetch globals we rely on. No DOM.
  target: "es2022",
});
