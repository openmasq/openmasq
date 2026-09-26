import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VIBE, vibeServers } from "./vibe";

const URL_ = "http://127.0.0.1:8787/mcp?t=t";
const dirs: string[] = [];
const home = (toml: string, agent?: string): string => {
  const d = mkdtempSync(join(tmpdir(), "vibe-home-"));
  dirs.push(d);
  writeFileSync(join(d, "config.toml"), toml);
  if (agent) {
    mkdirSync(join(d, "agents"));
    writeFileSync(join(d, "agents", "mine.toml"), agent);
  }
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const TOML = `
[[mcp_servers]]
name = "notion"
transport = "streamable-http"
url = "https://mcp.notion.test/mcp"
headers = { Authorization = "Bearer notion-SECRET" }

[[mcp_servers]]
name = "fs"
transport = "stdio"
command = "npx"
args = ["-y", "fs-server"]

[[mcp_servers]]
name = "off"
transport = "http"
url = "https://off.test"
disabled = true
`;

const run = (env: NodeJS.ProcessEnv) =>
  VIBE.exclusive({ configPath: "", dir: "", url: URL_, own: [], env });

describe("the Vibe client", () => {
  it("lists what Vibe loads, in Claude Desktop's shape, the disabled ones left out", () => {
    const own = vibeServers({
      configs: [
        {
          path: "c",
          doc: {
            mcp_servers: [
              {
                name: "notion",
                transport: "streamable-http",
                url: "https://mcp.notion.test/mcp",
              },
              { name: "fs", transport: "stdio", command: "npx", args: ["-y"] },
              {
                name: "off",
                transport: "http",
                url: "https://off.test",
                disabled: true,
              },
            ],
          },
        },
      ],
      agents: [],
    });
    expect(own.map((s) => s.id)).toEqual(["notion", "fs"]);
    expect(own[0].raw).toMatchObject({
      type: "http",
      url: "https://mcp.notion.test/mcp",
    });
  });

  it("re-declares EVERY server of theirs disabled, whole, beside ours — and closes the other doors", () => {
    const out = run({ VIBE_HOME: home(TOML), VIBE_DISABLED_TOOLS: '["bash"]' });
    if ("blocked" in out) throw new Error(out.blocked);
    const servers = JSON.parse(out.env!.VIBE_MCP_SERVERS) as Record<string, unknown>[];
    expect(servers.find((s) => s.name === "notion")).toMatchObject({
      disabled: true,
      url: "https://mcp.notion.test/mcp",
    });
    expect(servers.find((s) => s.name === "fs")).toMatchObject({
      disabled: true,
      command: "npx",
    });
    // The key rides a header: Vibe copies a server's URL into every tool result the model reads.
    const ours = servers.find((s) => s.name === "openmasq") as {
      url: string;
      headers: Record<string, string>;
    };
    expect(ours.url).toBe("http://127.0.0.1:8787/mcp");
    expect(ours.headers["x-openmasq-mcp-token"]).toBe("t");
    expect(ours.headers["x-openmasq-run"]).toMatch(/^[0-9a-f]{12}$/);
    // Theirs are STUBS: the environment every command Vibe runs inherits carries no token.
    expect(out.env!.VIBE_MCP_SERVERS).not.toContain("notion-SECRET");
    expect(out.env!.VIBE_ENABLE_CONNECTORS).toBe("false");
    // Appended to the user's own list, which Vibe concatenates across layers.
    expect(JSON.parse(out.env!.VIBE_DISABLED_TOOLS)).toEqual(["bash", "plugin_*"]);
  });

  it("blocks exclusivity when an agent profile declares its own MCP servers", () => {
    const out = run({
      VIBE_HOME: home(TOML, '[[mcp_servers]]\nname = "x"\ntransport = "stdio"\ncommand = "x"\n'),
    });
    expect(out).toHaveProperty("blocked");
  });

  it("blocks exclusivity when its config cannot be read, rather than half-applying it", () => {
    expect(run({ VIBE_HOME: home("[[mcp_servers]\n") })).toHaveProperty("blocked");
  });
});
