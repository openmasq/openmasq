import { describe, expect, it } from "vitest";
import { assertPrivate, parseServers, readServers } from "./servers";

const PRIVATE = { mode: 0o100600 };

describe("the servers file", () => {
  it("reads a stdio server, keeping its env (the credentials) on this side", () => {
    const [spec] = parseServers(
      JSON.stringify({
        mcpServers: {
          crm: { command: "npx", args: ["-y", "crm-mcp"], env: { CRM_TOKEN: "sk-1" } },
        },
      }),
    );
    expect(spec).toEqual({
      id: "crm",
      transport: "stdio",
      command: "npx",
      args: ["-y", "crm-mcp"],
      env: { CRM_TOKEN: "sk-1" },
    });
  });

  it("reads an http server with its headers", () => {
    const [spec] = parseServers(
      JSON.stringify({
        mcpServers: {
          notion: { url: "https://mcp.notion.com/mcp", headers: { Authorization: "Bearer x" } },
        },
      }),
    );
    expect(spec).toMatchObject({
      id: "notion",
      transport: "http",
      url: "https://mcp.notion.com/mcp",
    });
  });

  it("skips a server the user disabled, and keeps the others", () => {
    const specs = parseServers(
      JSON.stringify({ mcpServers: { a: { command: "a" }, b: { command: "b", disabled: true } } }),
    );
    expect(specs.map((s) => s.id)).toEqual(["a"]);
  });

  it("refuses an id carrying the namespace separator — it would break tool routing", () => {
    expect(() => parseServers(JSON.stringify({ mcpServers: { a__b: { command: "x" } } }))).toThrow(
      /not a usable server id/,
    );
  });

  it("refuses a server that is neither stdio nor http rather than silently dropping it", () => {
    expect(() => parseServers(JSON.stringify({ mcpServers: { x: { foo: 1 } } }))).toThrow(
      /needs either/,
    );
  });

  it("refuses a non-string credential instead of coercing it", () => {
    expect(() =>
      parseServers(JSON.stringify({ mcpServers: { x: { command: "c", env: { K: 12 } } } })),
    ).toThrow(/must be a string/);
  });

  it("refuses a credentials file other users can read", () => {
    expect(() => assertPrivate("/tmp/mcp.json", () => ({ mode: 0o100644 }), "linux")).toThrow(
      /chmod 600/,
    );
    expect(() => assertPrivate("/tmp/mcp.json", () => PRIVATE, "linux")).not.toThrow();
  });

  it("does not apply the POSIX test on Windows, where it would refuse every file", () => {
    // Node reports 0o666 there for any writable file — the bits mean nothing, and refusing
    // on them would make the feature unusable rather than safe. The guard is the profile ACL.
    expect(() =>
      assertPrivate("C:/Users/me/mcp.json", () => ({ mode: 0o100666 }), "win32"),
    ).not.toThrow();
    expect(() => assertPrivate("/tmp/mcp.json", () => ({ mode: 0o100666 }), "darwin")).toThrow();
  });

  it("names the file, never a value inside it, when the JSON is broken", () => {
    expect(() =>
      readServers("/home/me/mcp.json", { read: () => "{oops", stat: () => PRIVATE }),
    ).toThrow(/^\/home\/me\/mcp\.json: not valid JSON/);
  });
});

describe("why a server is down", () => {
  it("names the OAuth case for what it is — the common one after a take-over", async () => {
    const { whyDown } = await import("./upstream");
    // It names the command that fixes it: a reason with no next step is half a message.
    expect(whyDown(new Error('{"error":"invalid_token"}'), "notion")).toBe(
      "not signed in here — run: openmasq-proxy mcp login notion",
    );
    expect(whyDown(new Error("spawn npx ENOENT"))).toBe("spawn npx ENOENT");
  });
});
