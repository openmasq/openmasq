import { describe, expect, it } from "vitest";
import { adoptFrom } from "./adopt";
import { CLIENT_IDS, detectClient, pick, soleServerConfig } from "./clients";

const HOME = "/home/me";
const CWD = "/work/repo";

/** What `~/.claude.json` actually looks like: servers at the top for the user scope, and one
 *  entry per project keyed by its absolute path. */
const claudeJson = JSON.stringify({
  mcpServers: { notion: { type: "http", url: "https://mcp.notion.com/mcp" } },
  projects: {
    [CWD]: { mcpServers: { crm: { command: "npx", args: ["crm-mcp"], env: { T: "sk-1" } } } },
    "/elsewhere": { mcpServers: { other: { command: "nope" } } },
  },
});

describe("the wrapped client", () => {
  it("is recognised by its command name, path and extension included", () => {
    expect(detectClient("claude")?.id).toBe("claude");
    expect(detectClient("/opt/homebrew/bin/claude")?.id).toBe("claude");
    expect(detectClient("claude.cmd")?.id).toBe("claude");
  });

  it("is undefined for a client we cannot switch off — the caller must say so", () => {
    expect(detectClient("codex")).toBeUndefined();
    expect(CLIENT_IDS).toContain("claude");
  });

  it("asks the client itself for exclusivity, rather than editing its files", () => {
    expect(detectClient("claude")?.exclusiveArgs("/tmp/x/mcp.json")).toEqual([
      "--mcp-config",
      "/tmp/x/mcp.json",
      "--strict-mcp-config",
    ]);
  });

  it("hands it one server: ours", () => {
    const doc = JSON.parse(soleServerConfig("http://127.0.0.1:8787"));
    expect(doc).toEqual({
      mcpServers: { openmasq: { type: "http", url: "http://127.0.0.1:8787/mcp" } },
    });
  });

  it("walks to a nested map, and gives up rather than guessing", () => {
    expect(pick(JSON.parse(claudeJson), ["projects", CWD, "mcpServers"])).toHaveProperty("crm");
    expect(pick(JSON.parse(claudeJson), ["projects", "/nowhere", "mcpServers"])).toBeUndefined();
  });
});

describe("taking the client's servers over", () => {
  const read = (path: string): string => {
    if (path === `${HOME}/.claude.json`) return claudeJson;
    throw new Error("ENOENT");
  };
  const client = detectClient("claude")!;

  it("takes the user scope AND this project's, and leaves another project's alone", () => {
    const scopes: string[] = [];
    const specs = adoptFrom(client, CWD, HOME, [], {
      read,
      onAdopt: (id, s) => scopes.push(`${id}:${s}`),
    });
    expect(specs.map((s) => s.id).sort()).toEqual(["crm", "notion"]);
    expect(scopes.sort()).toEqual(["crm:local", "notion:user"]);
  });

  it("carries the credential across — that is the point of taking it over", () => {
    const [crm] = adoptFrom(client, CWD, HOME, [], { read }).filter((s) => s.id === "crm");
    expect(crm).toMatchObject({ transport: "stdio", env: { T: "sk-1" } });
  });

  it("lets the user's own declaration win on the same id", () => {
    const skipped: string[] = [];
    const mine = [
      { id: "notion", transport: "stdio" as const, command: "mine", args: [], env: {} },
    ];
    const specs = adoptFrom(client, CWD, HOME, mine, { read, onSkip: (id) => skipped.push(id) });
    expect(specs.map((s) => s.id)).toEqual(["crm"]);
    expect(skipped).toEqual(["notion"]);
  });

  it("reports one unusable entry instead of losing every other", () => {
    const broken = JSON.stringify({
      mcpServers: { bad: { nothing: true }, good: { command: "g" } },
    });
    const skipped: string[] = [];
    const specs = adoptFrom(client, CWD, HOME, [], {
      read: () => broken,
      onSkip: (id, why) => skipped.push(`${id}: ${why}`),
    });
    expect(specs.map((s) => s.id)).toContain("good");
    expect(skipped[0]).toMatch(/^bad: /);
  });

  it("says nothing about a file that simply is not there", () => {
    const skipped: string[] = [];
    const specs = adoptFrom(client, CWD, HOME, [], {
      read: () => {
        throw new Error("ENOENT");
      },
      onSkip: (id) => skipped.push(id),
    });
    expect(specs).toEqual([]);
    expect(skipped).toEqual([]);
  });
});
