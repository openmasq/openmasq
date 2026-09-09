import { defineConfig } from "tsup";

export default defineConfig({
  // Three entries: the pure core (`index`) has zero heavy deps and is always
  // testable; `transport` pulls in the official MCP SDK (stdio / HTTP+OAuth);
  // `node` is the local-host half (node:fs/http/crypto), which a browser consumer
  // must never drag in. Object form so a folder entry still emits `dist/<name>.{js,cjs,d.ts}`.
  // ⚠️ These keys and `package.json` `exports` move in lockstep (root rule 10).
  entry: {
    index: "src/index.ts",
    transport: "src/transport/index.ts",
    node: "src/node/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
});
