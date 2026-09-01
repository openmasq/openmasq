import { describe, expect, it } from "vitest";
import { connectedKeepList, connectedUrlHosts } from "./redactKeep";
import type { Host } from "../host";

const hostWith = (mcp: unknown): Host => ({ mcp } as unknown as Host);

describe("connectedKeepList", () => {
  it("includes a broker platform's name (even when not reflected in list())", async () => {
    const host = hostWith({
      listTools: async () => [],
      list: async () => [], // broker connection not reflected yet (e.g. post-restart)
      broker: async () => ({
        url: "http://127.0.0.1:1",
        platforms: [{ id: "stripe", name: "Stripe", desc: "", mcpUrl: "http://x" }],
      }),
    });
    const keep = await connectedKeepList(host);
    expect(keep).toContain("Stripe");
    expect(keep).toContain("stripe");
  });

  it("includes connected list() servers + namespaced tool serverIds", async () => {
    const host = hostWith({
      listTools: async () => [{ name: "notion__search" }, { name: "canva__create" }],
      list: async () => [{ id: "broker-canva", name: "Canva", connected: true }],
      broker: async () => null,
    });
    const keep = await connectedKeepList(host);
    expect(keep).toContain("notion");
    expect(keep).toContain("canva"); // from tool serverId AND the broker- prefix strip
    expect(keep).toContain("Canva");
  });

  it("ALSO keeps the bare TOOL name so a tool identifier is never redacted", async () => {
    const host = hostWith({
      listTools: async () => [{ name: "gmail__list_messages" }, { name: "stripe__create_customer" }],
      list: async () => [],
      broker: async () => null,
    });
    const keep = await connectedKeepList(host);
    expect(keep).toContain("gmail"); // connector id
    expect(keep).toContain("list_messages"); // bare tool name kept too
    expect(keep).toContain("create_customer");
  });

  it("is empty (redaction unchanged) with no mcp host", async () => {
    expect(await connectedKeepList({} as Host)).toEqual([]);
  });
});

describe("connectedUrlHosts", () => {
  it("derives the connected services' OWN domains from the keep list", async () => {
    const host = hostWith({
      listTools: async () => [{ name: "notion__notion-search" }, { name: "slack__slack_read_channel" }],
      list: async () => [],
      broker: async () => null,
    });
    const hosts = connectedUrlHosts(await connectedKeepList(host));
    expect(hosts).toContain("notion.com");
    expect(hosts).toContain("notion.so");
    expect(hosts).toContain("slack.com");
  });

  // ALLOW-list: what is not connected is never exempted. A catalog connector
  // the user hasn't linked must not have its URLs treated as structural.
  it("never returns a host for a connector nobody connected", async () => {
    const host = hostWith({
      listTools: async () => [{ name: "notion__notion-search" }],
      list: async () => [],
      broker: async () => null,
    });
    const hosts = connectedUrlHosts(await connectedKeepList(host));
    expect(hosts).not.toContain("github.com");
    expect(hosts).not.toContain("slack.com");
  });

  it("ignores the bare TOOL names the keep list also carries", () => {
    expect(connectedUrlHosts(["notion-search", "list_messages"])).toEqual([]);
  });

  it("is empty with nothing connected", () => {
    expect(connectedUrlHosts([])).toEqual([]);
  });
});
