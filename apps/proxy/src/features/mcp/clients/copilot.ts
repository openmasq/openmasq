import { join } from "node:path";
import type { AgentClient, OwnServer } from "./types.js";

/** `copilot mcp list --json` → every configured server, from all four sources it names (user,
 *  workspace, plugin, builtin), with an `enabled` flag. */
export function parseCopilotList(stdout: string): OwnServer[] {
  const doc: unknown = JSON.parse(stdout);
  if (typeof doc !== "object" || doc === null) throw new Error("expected a JSON object");
  const map = (doc as Record<string, unknown>).mcpServers;
  if (map === undefined) return [];
  if (typeof map !== "object" || map === null) throw new Error("`mcpServers` is not an object");
  const own: OwnServer[] = [];
  for (const [id, raw] of Object.entries(map as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (entry.enabled === false) continue;
    const scope = typeof entry.source === "string" ? `copilot ${entry.source}` : "copilot";
    if (typeof entry.url === "string") {
      own.push({ id, scope, url: entry.url, raw: { type: "http", url: entry.url } });
      continue;
    }
    if (typeof entry.command === "string")
      own.push({
        id,
        scope,
        raw: { command: entry.command, args: entry.args ?? [], env: entry.env ?? {} },
      });
  }
  return own;
}

/**
 * GitHub Copilot CLI. Two flags do it: `--disable-mcp-server <name>`, repeatable, plus
 * `--disable-builtin-mcps` for the ones it ships with (github-mcp-server today), and
 * `--additional-mcp-config @<file>` to add ours — that one AUGMENTS `~/.copilot/mcp-config.json`
 * rather than replacing it, which is why the disabling is per server here too.
 *
 * ⚠️ **Verified in the binary, not in a session.** 1.0.83 collects `--disable-mcp-server` and
 * the builtins into one `disabledServers` set and hands it to the session's MCP lifecycle, and
 * `--enable-mcp-server` is an un-disable, not an allow-list — so the shape is right. What
 * could not be exercised here is a live run: it needs a GitHub login. `copilot mcp list --json`
 * reports the CONFIGURATION and ignores these flags, so it cannot be a `recheck` either; that
 * absence is why this client has none, rather than a check that would always pass.
 */
export const COPILOT: AgentClient = {
  id: "copilot",
  probe: { args: ["mcp", "list", "--json"], parse: parseCopilotList },
  exclusive: ({ url, own, dir }) => {
    const path = join(dir, "copilot-mcp.json");
    return {
      args: [
        ...own.filter((s) => s.url !== url).flatMap((s) => ["--disable-mcp-server", s.id]),
        "--disable-builtin-mcps",
        "--additional-mcp-config",
        `@${path}`,
      ],
      write: {
        path,
        content: `${JSON.stringify(
          { mcpServers: { openmasq: { type: "http", url, tools: ["*"] } } },
          null,
          2,
        )}\n`,
      },
    };
  },
};
