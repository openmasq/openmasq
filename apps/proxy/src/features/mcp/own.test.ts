import { describe, expect, it } from "vitest";
import { adoptFrom } from "./adopt";
import { detectClient } from "./clients/index";
import { notOurs, ownServers, type Own } from "./own";

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

const claude = detectClient("claude")!;
const learn = (read: (p: string) => string): Own =>
  ownServers(claude, { command: "claude", cwd: CWD, home: HOME, read });
const own = (read: (p: string) => string) => {
  const out = learn(read);
  if ("failed" in out) throw new Error(out.failed);
  return out.own;
};

const readClaude = (path: string): string => {
  if (path === `${HOME}/.claude.json`) return claudeJson;
  throw new Error("ENOENT");
};

describe("what the client says it has", () => {
  it("reads the user scope AND this project's, and leaves another project's alone", () => {
    expect(own(readClaude).map((s) => `${s.id}:${s.scope}`)).toEqual(["notion:user", "crm:local"]);
  });

  it("says nothing about a file that simply is not there", () => {
    expect(
      own(() => {
        throw new Error("ENOENT");
      }),
    ).toEqual([]);
  });

  /** Gemini CLI writes `httpUrl` for an http server when it was added by hand, `url` when it
   *  was added by `gemini mcp add`. Both name the same thing, and both have to match OUR
   *  endpoint for the allow-list to find it. */
  it("reads an HTTP endpoint under either of the two spellings", () => {
    const gemini = detectClient("gemini")!;
    const settings = JSON.stringify({
      mcpServers: {
        a: { httpUrl: "http://127.0.0.1:8787/mcp" },
        b: { url: "https://mcp.notion.com/mcp", type: "http" },
      },
    });
    const out = ownServers(gemini, {
      command: "gemini",
      cwd: CWD,
      home: HOME,
      read: () => settings,
    });
    if ("failed" in out) throw new Error(out.failed);
    expect(out.own.map((s) => s.url)).toEqual([
      "http://127.0.0.1:8787/mcp",
      "https://mcp.notion.com/mcp",
    ]);
    // …and the entry handed to adoption speaks the one spelling `parseServerMap` reads.
    expect(out.own[0].raw).toEqual({ url: "http://127.0.0.1:8787/mcp" });
  });

  /**
   * ⚠️ FAIL CLOSED. A client whose exclusivity names each server one by one (Codex) is only
   * exclusive if the list is COMPLETE — so a probe that does not answer is an outcome the
   * caller must see, never an empty list that reads like "it has none".
   */
  it("reports a probe that failed instead of returning nothing", () => {
    const codex = detectClient("codex")!;
    const out = ownServers(codex, {
      command: "codex",
      cwd: CWD,
      home: HOME,
      run: () => {
        throw new Error("exited 1");
      },
    });
    expect(out).toHaveProperty("failed");
    expect((out as { failed: string }).failed).toContain("codex mcp list --json");
  });

  it("asks the binary when the client has a probe, and never reads its files", () => {
    const codex = detectClient("codex")!;
    const out = ownServers(codex, {
      command: "/usr/local/bin/codex",
      cwd: CWD,
      home: HOME,
      read: () => {
        throw new Error("a probe client must not read files");
      },
      run: (command, args) => {
        expect(command).toBe("/usr/local/bin/codex");
        expect(args).toEqual(["mcp", "list", "--json"]);
        return JSON.stringify([
          { name: "crm", enabled: true, transport: { type: "stdio", command: "npx" } },
        ]);
      },
    });
    expect(out).toEqual({
      own: [{ id: "crm", scope: "codex", raw: { command: "npx", args: [], env: {} } }],
    });
  });
});

describe("taking the client's servers over", () => {
  /** ⚠️ REGRESSION. Gemini CLI's allow-list works over what the USER declared, so our own
   *  endpoint is in the list `exclusive()` reads — and adoption reads the same list. Taken
   *  over, the proxy would connect to itself and re-serve its own tools under a second
   *  prefix, on every start. */
  it("never takes over the endpoint that is us", () => {
    const endpoint = "http://127.0.0.1:8787/mcp";
    const all = [
      { id: "openmasq", scope: "user", url: endpoint, raw: { url: endpoint } },
      {
        id: "crm",
        scope: "user",
        url: "https://crm.example/mcp",
        raw: { url: "https://crm.example/mcp" },
      },
    ];
    expect(notOurs(all, endpoint).map((s) => s.id)).toEqual(["crm"]);
  });

  it("carries the credential across — that is the point of taking it over", () => {
    const [crm] = adoptFrom(own(readClaude), []).filter((s) => s.id === "crm");
    expect(crm).toMatchObject({ transport: "stdio", env: { T: "sk-1" } });
  });

  it("lets the user's own declaration win on the same id", () => {
    const skipped: string[] = [];
    const mine = [
      { id: "notion", transport: "stdio" as const, command: "mine", args: [], env: {} },
    ];
    const specs = adoptFrom(own(readClaude), mine, { onSkip: (id) => skipped.push(id) });
    expect(specs.map((s) => s.id)).toEqual(["crm"]);
    expect(skipped).toEqual(["notion"]);
  });

  it("reports one unusable entry instead of losing every other", () => {
    const broken = JSON.stringify({
      mcpServers: { bad: { nothing: true }, good: { command: "g" } },
    });
    const skipped: string[] = [];
    const specs = adoptFrom(
      own(() => broken),
      [],
      { onSkip: (id, why) => skipped.push(`${id}: ${why}`) },
    );
    expect(specs.map((s) => s.id)).toContain("good");
    expect(skipped[0]).toMatch(/^bad: /);
  });
});
