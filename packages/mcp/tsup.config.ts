import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries: the pure core (`index`) has zero heavy deps and is always
  // testable; `transport` pulls in the official MCP SDK (stdio / HTTP+OAuth).
  // Object form so the folder entry still emits `dist/transport.{js,cjs,d.ts}`.
  entry: { index: "src/index.ts", transport: "src/transport/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
});
