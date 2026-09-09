import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDoc, removeEntry, runAdd, validateEntry, writeDoc } from "./add";
import type { Probe } from "./probe";
import type { Prompt } from "./prompt";

const file = (): string => join(mkdtempSync(join(tmpdir(), "openmasq-add-")), "mcp.json");

/** A prompt that answers from a script, and records what it was asked. */
function scripted(answers: string[]): Prompt & { asked: string[] } {
  const asked: string[] = [];
  const next = (q: string): string => {
    asked.push(q);
    return answers.shift() ?? "";
  };
  return {
    asked,
    ask: async (q, o) => next(q) || o?.default || "",
    secret: async (q) => next(q),
    choose: async (q, options) => {
      const a = next(q);
      return (options.find(([k]) => k === a)?.[0] ?? options[0][0]) as never;
    },
    confirm: async (q, fallback = false) => {
      const a = next(q);
      return a ? a.startsWith("y") : fallback;
    },
    close: () => {},
  };
}

const probeOf =
  (over: Partial<Probe> = {}) =>
  async (): Promise<Probe> => ({
    reachable: true,
    dynamicRegistration: true,
    scopes: [],
    ...over,
  });

const run = (path: string, answers: string[], probe = probeOf()) => {
  const prompt = scripted(answers);
  return runAdd({ prompt, path, say: () => {}, probe }).then((id) => ({ id, asked: prompt.asked }));
};

describe("the add form", () => {
  it("asks a self-registering server for NOTHING beyond its URL", async () => {
    const path = file();
    const { id, asked } = await run(path, ["sentry", "remote", "https://mcp.sentry.dev/mcp"]);
    expect(id).toBe("sentry");
    expect(asked.join(" ")).not.toMatch(/Client id/);
    expect(readDoc(path).mcpServers.sentry).toEqual({ url: "https://mcp.sentry.dev/mcp" });
  });

  it("asks for a client id ONLY when the provider issues them by hand", async () => {
    const path = file();
    const { asked } = await run(
      path,
      ["gmail", "remote", "https://gmailmcp.googleapis.com/mcp/v1", "cid.apps", "sec", ""],
      probeOf({
        dynamicRegistration: false,
        authorizationServer: "https://accounts.google.com/",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      }),
    );
    expect(asked.join(" ")).toMatch(/Client id/);
    // The advertised scope is offered as the default rather than typed out by hand.
    expect(readDoc(path).mcpServers.gmail).toEqual({
      url: "https://gmailmcp.googleapis.com/mcp/v1",
      clientId: "cid.apps",
      clientSecret: "sec",
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
    });
  });

  it("offers a static header when the server publishes no OAuth at all", async () => {
    const path = file();
    await run(
      path,
      ["thing", "remote", "https://example.test/mcp", "y", "Authorization", "Bearer t"],
      probeOf({ reachable: false, note: "no metadata" }),
    );
    expect(readDoc(path).mcpServers.thing).toEqual({
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer t" },
    });
  });

  it("declares a local server with its command, arguments and secret env", async () => {
    const path = file();
    await run(path, ["crm", "local", "npx", "-y crm-mcp", "y", "CRM_TOKEN", "sk-1", ""]);
    expect(readDoc(path).mcpServers.crm).toEqual({
      command: "npx",
      args: ["-y", "crm-mcp"],
      env: { CRM_TOKEN: "sk-1" },
    });
  });

  it("refuses a bad answer HERE, while it is still on screen", async () => {
    await expect(run(file(), ["Bad Name", "remote", "https://x.test/mcp"])).rejects.toThrow(
      /not a usable server id/,
    );
  });

  it("keeps an entry it does not understand, instead of rewriting the file over it", async () => {
    const path = file();
    writeDoc(path, { mcpServers: { legacy: { command: "old", weird: true } } });
    await run(path, ["sentry", "remote", "https://mcp.sentry.dev/mcp"]);
    expect(readDoc(path).mcpServers.legacy).toEqual({ command: "old", weird: true });
  });

  it("backs out when the user refuses to replace an existing name", async () => {
    const path = file();
    writeDoc(path, { mcpServers: { sentry: { url: "https://old.test/mcp" } } });
    const { id } = await run(path, ["sentry", "n"]);
    expect(id).toBe("");
    expect(readDoc(path).mcpServers.sentry).toEqual({ url: "https://old.test/mcp" });
  });

  it("writes the file 0600 — it holds API keys", async () => {
    const path = file();
    await run(path, ["crm", "local", "npx", "", "n"]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("removes an entry, and says so when there was none", () => {
    const path = file();
    writeDoc(path, { mcpServers: { a: { command: "x" } } });
    expect(removeEntry(path, "a")).toBe(true);
    expect(removeEntry(path, "a")).toBe(false);
    expect(readDoc(path).mcpServers).toEqual({});
  });

  it("validates an entry the way a start-up would", () => {
    expect(validateEntry("ok", { url: "https://x.test/mcp" })).toMatchObject({ transport: "http" });
    expect(() => validateEntry("ok", { nothing: true })).toThrow(/needs either/);
  });

  it("reads an absent file as an empty one", () => {
    expect(readDoc(join(tmpdir(), "openmasq-nope", "mcp.json")).mcpServers).toEqual({});
  });
});

describe("the pre-registered client, in the servers file", () => {
  it("is parsed, and a secret without an id is refused", async () => {
    const { parseServers } = await import("./servers");
    const [spec] = parseServers(
      JSON.stringify({
        mcpServers: {
          g: { url: "https://g.test/mcp", clientId: "c", clientSecret: "s", scopes: "a b" },
        },
      }),
    );
    expect(spec).toMatchObject({ clientId: "c", clientSecret: "s", scopes: "a b" });
    expect(() =>
      parseServers(
        JSON.stringify({ mcpServers: { g: { url: "https://g.test/mcp", clientSecret: "s" } } }),
      ),
    ).toThrow(/without a clientId/);
  });
});
