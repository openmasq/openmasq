/** The agentic MCP loop. `runMcpAgentLoop` in `runLoop.ts`; the rule-11 boundary in
 *  `boundary.ts`; the per-call gates under `gates/`; the intercepted tools in `intercepted*.ts`. */
export { runMcpAgentLoop } from "./runLoop";
export type { McpAgentParams, WriteConfirmInfo, WriteConfirmReason } from "./types";
export type { ToolStruggle } from "../toolStruggle";
// Re-exported so the importers of the loop keep one address for its classification helpers.
export { isWriteTool, isConfidentReadOnly, isSearchTool, looksWebIntent } from "../mcpAgentClassify";
export { classifyToolError } from "../toolFault";
export { writeKey } from "../writeIdempotency";
export { exhaustionMessage, pythonErrorHint } from "../mcpAgentGuidance";
export { summarizeToolResult } from "../toolResultSummary";
