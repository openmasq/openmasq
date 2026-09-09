import { describe, expect, it } from "vitest";
import {
  CLIENT_IDS,
  detectClient,
  parseCodexList,
  pick,
  soleServerConfig,
  type OwnServer,
} from "./clients";

const URL = "http://127.0.0.1:8787/mcp";
const CWD = "/work/repo";

const ctx = (own: OwnServer[] = []) => ({ configPath: "/tmp/x/mcp.json", url: URL, own });
const stdio = (id: string, scope = "user"): OwnServer => ({
  id,
  scope,
  raw: { command: "npx", args: [`${id}-mcp`] },
});

describe("the wrapped client", () => {
  it("is recognised by its command name, path and extension included", () => {
    expect(detectClient("claude")?.id).toBe("claude");
    expect(detectClient("/opt/homebrew/bin/codex")?.id).toBe("codex");
    expect(detectClient("gemini.cmd")?.id).toBe("gemini");
  });

  it("is undefined for a client we cannot switch off — the caller must say so", () => {
    // Cursor's CLI has no flag for "only this MCP config" and no allow-list; being absent
    // here is what makes `start.ts` warn instead of promising a mask it cannot apply.
    expect(detectClient("cursor-agent")).toBeUndefined();
    expect(CLIENT_IDS).toEqual(["claude", "codex", "gemini"]);
  });

  it("hands it one server: ours", () => {
    const doc = JSON.parse(soleServerConfig("http://127.0.0.1:8787"));
    expect(doc).toEqual({ mcpServers: { openmasq: { type: "http", url: URL } } });
  });

  it("walks to a nested map, and gives up rather than guessing", () => {
    const claudeJson = { projects: { [CWD]: { mcpServers: { crm: { command: "npx" } } } } };
    expect(pick(claudeJson, ["projects", CWD, "mcpServers"])).toHaveProperty("crm");
    expect(pick(claudeJson, ["projects", "/nowhere", "mcpServers"])).toBeUndefined();
  });
});

describe("Claude Code — one switch of its own", () => {
  it("asks the client itself for exclusivity, rather than editing its files", () => {
    expect(detectClient("claude")?.exclusive(ctx())).toEqual({
      args: ["--mcp-config", "/tmp/x/mcp.json", "--strict-mcp-config"],
    });
  });
});

describe("Codex — no switch, so every server is named", () => {
  const codex = detectClient("codex")!;

  it("disables each server it has and adds ours, all on the command line", () => {
    expect(codex.exclusive(ctx([stdio("notion", "codex"), stdio("crm", "codex")]))).toEqual({
      args: [
        "-c",
        "mcp_servers.notion.enabled=false",
        "-c",
        "mcp_servers.crm.enabled=false",
        "-c",
        `mcp_servers.openmasq={url="${URL}"}`,
      ],
    });
  });

  /** ⚠️ A whole-table override MERGES (measured on codex-cli 0.149.1): `-c mcp_servers={…}`
   *  leaves the user's servers in place and adds ours beside them. The per-server disabling
   *  is not a stylistic choice, and this is the test that says so. */
  it("never relies on replacing the table", () => {
    const { args } = codex.exclusive(ctx([stdio("notion", "codex")])) as { args: string[] };
    expect(args).not.toContain("mcp_servers={}");
    expect(args.filter((a) => a.endsWith("enabled=false"))).toHaveLength(1);
  });

  it("leaves an entry that already is us alone — it is re-declared, not disabled", () => {
    const own = [stdio("crm", "codex"), { id: "openmasq", scope: "codex", url: URL, raw: {} }];
    const { args } = codex.exclusive(ctx(own)) as { args: string[] };
    expect(args).not.toContain("mcp_servers.openmasq.enabled=false");
    expect(args).toContain(`mcp_servers.openmasq={url="${URL}"}`);
  });

  it("blocks rather than half-applying, for an id a `-c` path cannot address", () => {
    const out = codex.exclusive(ctx([{ id: "my.crm", scope: "codex", raw: {} }]));
    expect(out).toHaveProperty("blocked");
    expect((out as { blocked: string }).blocked).toContain("my.crm");
  });

  it("reads the servers Codex itself reports, and leaves a disabled one out", () => {
    // Verbatim shape of `codex mcp list --json` (codex-cli 0.149.1).
    const own = parseCodexList(
      JSON.stringify([
        { name: "crm", enabled: true, transport: { type: "stdio", command: "npx", args: ["crm"] } },
        { name: "off", enabled: false, transport: { type: "stdio", command: "npx" } },
        {
          name: "notion",
          enabled: true,
          transport: { type: "streamable_http", url: "https://mcp.notion.com/mcp" },
        },
      ]),
    );
    expect(own.map((s) => s.id)).toEqual(["crm", "notion"]);
    expect(own[0].raw).toEqual({ command: "npx", args: ["crm"], env: {} });
    expect(own[1]).toMatchObject({ url: "https://mcp.notion.com/mcp" });
  });
});

describe("Gemini CLI — an allow-list over what the user declared", () => {
  const gemini = detectClient("gemini")!;

  it("finds OUR entry by URL, whatever the user called it", () => {
    const own = [stdio("crm"), { id: "masq", scope: "user", url: URL, raw: { url: URL } }];
    expect(gemini.exclusive(ctx(own))).toEqual({
      args: ["--allowed-mcp-server-names", "masq"],
    });
  });

  /** An allow-list naming a server that is not declared leaves the session with NO tools at
   *  all. Saying what to run once is the honest answer; a silent empty list is not. */
  it("blocks with the one command to run when the proxy is not declared", () => {
    const out = gemini.exclusive(ctx([stdio("crm")]));
    expect((out as { blocked: string }).blocked).toContain(`gemini mcp add -s user -t http`);
    expect((out as { blocked: string }).blocked).toContain(URL);
  });
});
