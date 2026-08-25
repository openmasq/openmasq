import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  // knex is passed IN by the consumer (backend/container) — never bundle it here.
  external: ["@openmasq/llm", "knex"],
});
