import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OwnServer } from "./clients/index";
import type { McpPolicy } from "./policy";
import { resolveSpecs } from "./resolve";

// Ours: notion (HTTP) and crm (local). The client's: notion too, and github.
let dir: string;
let mine: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openmasq-resolve-"));
  mine = join(dir, "mcp.json");
  writeFileSync(
    mine,
    JSON.stringify({
      mcpServers: {
        notion: { url: "https://mcp.notion.com/mcp" },
        crm: { command: "crm-mcp", args: [], env: { T: "sk-1" } },
      },
    }),
  );
  chmodSync(mine, 0o600);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const theirs: OwnServer[] = [
  {
    id: "notion",
    scope: "user",
    url: "https://mcp.notion.com/mcp",
    raw: { url: "https://mcp.notion.com/mcp" },
  },
  { id: "github", scope: "user", raw: { command: "gh-mcp", args: [] } },
];

const resolve = (policy: McpPolicy | undefined, own: OwnServer[] | undefined = theirs) => {
  const said: string[] = [];
  const specs = resolveSpecs({
    configPath: mine,
    ...(own ? { own } : {}),
    adopt: true,
    ...(policy ? { policy } : {}),
    onPolicy: (id, text, tone) => said.push(`${tone} ${id}: ${text}`),
  });
  return { ids: specs.map((s) => s.id), specs, said };
};

describe("whose server it is (proxy.json › mcp › source)", () => {
  it("with no policy, ours wins on a shared id and the rest is taken over", () => {
    expect(resolve(undefined).ids).toEqual(["notion", "crm", "github"]);
  });

  it("`openmasq`: ours, and the client's same-named one is set aside", () => {
    const r = resolve({ notion: { source: "openmasq" } });
    expect(r.ids).toEqual(["notion", "crm", "github"]);
    expect(r.specs.find((s) => s.id === "notion")).toMatchObject({ transport: "http" });
    expect(r.said).toEqual(["info notion: yours, per proxy.json — the client's is set aside"]);
  });

  it("`openmasq` on a server we do not declare: ABSENT, never a fallback to the client's", () => {
    const r = resolve({ github: { source: "openmasq" } });
    expect(r.ids).toEqual(["notion", "crm"]);
    expect(r.said[0]).toMatch(
      /^warn github: proxy.json says openmasq provides it.*absent from this run/,
    );
  });

  it("`client`: theirs through the proxy, ours set aside for the run", () => {
    const r = resolve({ notion: { source: "client" } });
    expect(r.ids).toEqual(["crm", "notion", "github"]);
    expect(r.said).toEqual([
      "info notion: the client's is taken, yours set aside — per proxy.json",
    ]);
    // …and a client that declares no such server leaves the run without it, said out loud.
    const none = resolve({ crm: { source: "client" } });
    expect(none.ids).toEqual(["notion", "github"]);
    expect(none.said[0]).toMatch(/^warn crm: .*declares no crm — absent from this run/);
  });

  it("`off`: neither side, whatever both declare", () => {
    const r = resolve({ notion: { source: "off" }, github: { source: "off" } });
    expect(r.ids).toEqual(["crm"]);
    expect(r.said).toEqual([
      "info notion: off, per proxy.json — absent from this run",
      "info github: off, per proxy.json — absent from this run",
    ]);
  });

  it("a level or a write policy alone changes nothing about who provides the server", () => {
    expect(resolve({ notion: { level: "strict", writes: "deny" } }).ids).toEqual([
      "notion",
      "crm",
      "github",
    ]);
  });
});
