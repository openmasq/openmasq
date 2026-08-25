import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  STDIO_CATALOG,
  buildEnv,
  catalogForUi,
  getCatalogEntry,
  resolveParams,
  type StdioCatalogEntry,
} from "./catalog";

// A token-based server fixture for the env-security tests. The real token
// servers (Slack/Gmail/GitHub) were removed pending OAuth, but buildEnv's
// contract (declared pass-through, required enforcement, undeclared drop) must
// still hold for whatever env-taking server ships next — so test it against a
// fixture, not a catalog entry that may come and go.
const TOKEN_SERVER: StdioCatalogEntry = {
  id: "test-token-server",
  name: "Test Token Server",
  desc: "fixture",
  tone: "amber",
  command: "npx",
  args: ["-y", "@example/server"],
  env: [
    { key: "SLACK_BOT_TOKEN", label: "Bot token", required: true, secret: true },
    { key: "SLACK_TEAM_ID", label: "Team id", required: true },
  ],
};
const filesystem = getCatalogEntry("filesystem")!;

describe("stdio catalog — env security", () => {
  it("passes through declared values", () => {
    const { env, missing } = buildEnv(TOKEN_SERVER, {
      SLACK_BOT_TOKEN: "xoxb-1",
      SLACK_TEAM_ID: "T1",
    });
    expect(missing).toEqual([]);
    expect(env.SLACK_BOT_TOKEN).toBe("xoxb-1");
    expect(env.SLACK_TEAM_ID).toBe("T1");
  });

  it("reports missing required keys (and never spawns them)", () => {
    const { env, missing } = buildEnv(TOKEN_SERVER, { SLACK_BOT_TOKEN: "xoxb-1" });
    expect(missing).toEqual(["SLACK_TEAM_ID"]);
    expect(env.SLACK_TEAM_ID).toBeUndefined();
  });

  it("DROPS keys not declared in the schema (no arbitrary env injection)", () => {
    const { env } = buildEnv(TOKEN_SERVER, {
      SLACK_BOT_TOKEN: "xoxb-1",
      SLACK_TEAM_ID: "T1",
      EVIL: "rm -rf /",
      LD_PRELOAD: "/tmp/x.so",
      PATH: "/attacker/bin",
    });
    expect(env.EVIL).toBeUndefined();
    expect(env.LD_PRELOAD).toBeUndefined();
    // PATH comes from the SDK's filtered base env, not from renderer input.
    expect(env.PATH).not.toBe("/attacker/bin");
  });

  it("treats blank values as missing for required fields", () => {
    const { missing } = buildEnv(TOKEN_SERVER, { SLACK_BOT_TOKEN: "  ", SLACK_TEAM_ID: "" });
    expect(missing).toContain("SLACK_BOT_TOKEN");
    expect(missing).toContain("SLACK_TEAM_ID");
  });

  it("spawnable entries ship vetted npx commands (no shell); in-process entries run no command", () => {
    for (const entry of STDIO_CATALOG) {
      if (entry.inProcess) {
        // Filesystem runs in-process (LocalFsConnection) — it must NOT carry a
        // spawnable command (the @modelcontextprotocol/server-filesystem dep was dropped).
        expect(entry.command).toBe("");
        expect(entry.args).toEqual([]);
      } else {
        expect(entry.command).toBe("npx");
        expect(entry.args[0]).toBe("-y");
      }
    }
  });

  it("the filesystem entry is in-process and advertises no shell command line", () => {
    expect(filesystem.inProcess).toBe(true);
    expect(catalogForUi().find((e) => e.id === "filesystem")?.commandLine).toBe("");
  });
});

describe("stdio catalog — path-grant security (filesystem)", () => {
  it("accepts an existing absolute directory and appends it as an arg", () => {
    const { args, errors } = resolveParams(filesystem, { root: tmpdir() });
    expect(errors).toEqual([]);
    expect(args).toEqual([tmpdir()]);
  });

  it("rejects a relative path", () => {
    const { args, errors } = resolveParams(filesystem, { root: "./secrets" });
    expect(args).toEqual([]);
    expect(errors[0]).toMatch(/absolu/);
  });

  it("rejects a non-existent directory", () => {
    const { args, errors } = resolveParams(filesystem, { root: "/nope/does/not/exist/x9" });
    expect(args).toEqual([]);
    expect(errors[0]).toMatch(/introuvable/);
  });

  it("reports a missing required path grant", () => {
    const { errors } = resolveParams(filesystem, {});
    expect(errors[0]).toMatch(/requis/);
  });
});
