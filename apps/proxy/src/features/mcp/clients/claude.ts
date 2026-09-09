import { join } from "node:path";
import type { AgentClient } from "./types.js";

/**
 * Claude Code. `--strict-mcp-config` is the client's own switch for "only the servers in
 * --mcp-config, ignore all other MCP configurations" — which is exactly the exclusivity this
 * needs, expressed by the client rather than imposed on its files.
 *
 * Verified in a real session: the model's tool list came back as `mcp__openmasq__crm__*` and
 * nothing else, account connectors included. ⚠️ `claude mcp list` still prints every
 * configured server — it inspects the CONFIG, not the session; it proves nothing here.
 */
export const CLAUDE: AgentClient = {
  id: "claude",
  exclusive: ({ configPath }) => ({
    args: ["--mcp-config", configPath, "--strict-mcp-config"],
  }),
  declarations: (cwd, home) => [
    { path: join(home, ".claude.json"), at: ["mcpServers"], scope: "user" },
    { path: join(home, ".claude.json"), at: ["projects", cwd, "mcpServers"], scope: "local" },
    { path: join(cwd, ".mcp.json"), at: ["mcpServers"], scope: "project" },
  ],
};
