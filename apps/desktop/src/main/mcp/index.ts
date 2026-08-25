// Barrel for the MCP subsystem. The live-server management (connections, routing,
// connect/OAuth flows, the tool-dispatch security path) lives in `./server/` — split
// by concern so the security surface stays legible (rule 10) and the shared live-
// connection state has ONE home (`server/registry.ts`, rule 2). Consumers still import
// from `./mcp`; this re-export keeps the public surface byte-identical.
export * from "./server";
