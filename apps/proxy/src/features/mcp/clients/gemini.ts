import { join } from "node:path";
import type { AgentClient } from "./types.js";

/**
 * Gemini CLI. `--allowed-mcp-server-names <name…>` is an allow-list the client applies to
 * everything it would otherwise connect to — settings, workspace, extensions — which is the
 * exclusivity. What it does NOT have is a way to be handed a server on the command line, and
 * the one env var that relocates its settings (`GEMINI_CLI_HOME`) moves its CREDENTIALS with
 * them: using it would log the user out to change a tool list.
 *
 * So the proxy has to be declared once, by the user, and this looks for it BY URL rather than
 * by name — the entry is theirs, so the name is theirs too. Nothing found ⇒ blocked, with the
 * command to run; never a silent allow-list of a name that does not exist, which would leave
 * the session with no tools at all.
 *
 * ⚠️ Its SUBCOMMANDS refuse the flag (`gemini mcp list` dies on « Unknown arguments »), so a
 * wrapped `-- gemini <subcommand>` breaks loudly. Wrap a session; that is where it belongs.
 */
export const GEMINI: AgentClient = {
  id: "gemini",
  declarations: (cwd, home) => [
    { path: join(home, ".gemini", "settings.json"), at: ["mcpServers"], scope: "user" },
    { path: join(cwd, ".gemini", "settings.json"), at: ["mcpServers"], scope: "workspace" },
  ],
  exclusive: ({ url, own }) => {
    const ours = own.find((s) => s.url === url);
    return ours
      ? { args: ["--allowed-mcp-server-names", ours.id] }
      : {
          blocked:
            "gemini takes no MCP server on the command line — declare the proxy once with " +
            `« gemini mcp add -s user -t http openmasq ${url} » and this run makes it the only one`,
        };
  },
};
