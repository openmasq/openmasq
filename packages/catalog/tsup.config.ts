import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/models/index.ts",
    "src/mcp/index.ts",
    "src/redaction/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  external: ["@openmasq/llm", "@openmasq/redact"],
});
