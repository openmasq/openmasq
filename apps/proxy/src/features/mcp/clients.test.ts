import { describe, expect, it } from "vitest";
import {
  CLIENT_IDS,
  detectClient,
  parseCodexList,
  parseCopilotList,
  parseOpencodeConfig,
  pick,
  soleServerConfig,
  type OwnServer,
} from "./clients/index";

const URL = "http://127.0.0.1:8787/mcp";
const CWD = "/work/repo";

const ctx = (own: OwnServer[] = [], env: NodeJS.ProcessEnv = {}) => ({
  configPath: "/tmp/x/mcp.json",
  dir: "/tmp/x",
  url: URL,
  own,
  env,
});
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
    expect(CLIENT_IDS).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "copilot",
      "hermes",
      "vibe",
    ]);
  });

  it("hands it one server: ours", () => {
    const doc = JSON.parse(soleServerConfig(`${URL}?t=k`));
    expect(doc).toEqual({ mcpServers: { openmasq: { type: "http", url: `${URL}?t=k` } } });
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
        "-c",
        "features.apps=false",
      ],
    });
  });

  /** ⚠️ REGRESSION, from a real session: `codex mcp list --json` said « no servers » and the
   *  model still had a dozen `mcp__codex_apps__*` tools — the built-in apps server, a feature
   *  flag rather than a config entry. Disabling it is part of exclusivity, not an option. */
  it("switches the built-in apps server off, which no listing reports", () => {
    const { args } = codex.exclusive(ctx([])) as { args: string[] };
    expect(args.join(" ")).toContain("-c features.apps=false");
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

describe("opencode — one config file, merged, with a layer above it", () => {
  const opencode = detectClient("opencode")!;

  it("adds ours and switches every other off, in a file of its own shape", () => {
    const out = opencode.exclusive(ctx([stdio("decoy", "opencode")]));
    if ("blocked" in out) throw new Error(out.blocked);
    expect(out.env).toEqual({ OPENCODE_CONFIG: "/tmp/x/opencode.json" });
    expect(out.args).toEqual([]);
    expect(JSON.parse(out.write!.content).mcp).toEqual({
      openmasq: { type: "remote", url: URL, enabled: true },
      decoy: { enabled: false },
    });
  });

  /** ⚠️ The env slot is single. Taking it would drop the user's own file — and with it
   *  settings that have nothing to do with MCP. */
  it("refuses rather than replacing an OPENCODE_CONFIG the user already set", () => {
    const out = opencode.exclusive(ctx([], { OPENCODE_CONFIG: "/home/me/mine.json" }));
    expect((out as { blocked: string }).blocked).toContain("already set");
  });

  /**
   * ⚠️ REGRESSION, measured on 1.18.30: a project `opencode.json` re-enables what our file
   * disabled — its layer outranks `OPENCODE_CONFIG`. So the probe is asked AGAIN under our
   * configuration, and anything still standing besides us blocks exclusivity.
   */
  it("names what survived the configuration we hand it", () => {
    const resolved = JSON.stringify({
      mcp: { openmasq: { type: "remote", url: URL }, decoy: { command: ["node", "d.mjs"] } },
    });
    expect(opencode.recheck!(resolved, "openmasq")).toEqual(["decoy"]);
    const alone = JSON.stringify({ mcp: { openmasq: { type: "remote", url: URL } } });
    expect(opencode.recheck!(alone, "openmasq")).toEqual([]);
  });

  it("reads the resolved config, disabled entries left out", () => {
    // Verbatim shape of `opencode debug config` (opencode 1.18.30).
    const own = parseOpencodeConfig(
      JSON.stringify({
        mcp: {
          decoy: { type: "local", command: ["node", "fake.mjs"], enabled: true },
          off: { type: "local", command: ["node", "x.mjs"], enabled: false },
          remote: { type: "remote", url: "https://crm.example/mcp", enabled: true },
        },
      }),
    );
    expect(own.map((s) => s.id)).toEqual(["decoy", "remote"]);
    expect(own[0].raw).toEqual({ command: "node", args: ["fake.mjs"], env: {} });
  });
});

describe("Copilot CLI — its own two flags", () => {
  const copilot = detectClient("copilot")!;

  it("disables each server and its builtins, and adds ours as an extra config", () => {
    const out = copilot.exclusive(ctx([stdio("decoy", "copilot user")]));
    if ("blocked" in out) throw new Error(out.blocked);
    expect(out.args).toEqual([
      "--disable-mcp-server",
      "decoy",
      "--disable-builtin-mcps",
      "--additional-mcp-config",
      "@/tmp/x/copilot-mcp.json",
    ]);
    expect(JSON.parse(out.write!.content).mcpServers.openmasq).toEqual({
      type: "http",
      url: URL,
      tools: ["*"],
    });
  });

  /** Its `mcp list` reports the CONFIGURATION and ignores session flags, so a recheck would
   *  always pass. An absent check is honest; one that cannot fail is not. */
  it("has no recheck, because its listing cannot see a session's flags", () => {
    expect(copilot.recheck).toBeUndefined();
  });

  it("reads every source it lists, and keeps where each came from", () => {
    // Verbatim shape of `copilot mcp list --json` (GitHub Copilot CLI 1.0.83).
    const own = parseCopilotList(
      JSON.stringify({
        mcpServers: {
          decoy: { type: "local", command: "node", args: ["f.mjs"], source: "user", enabled: true },
          off: { type: "local", command: "node", source: "workspace", enabled: false },
        },
      }),
    );
    expect(own.map((s) => `${s.id}:${s.scope}`)).toEqual(["decoy:copilot user"]);
  });
});
