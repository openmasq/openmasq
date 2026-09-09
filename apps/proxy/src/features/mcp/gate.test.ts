import { describe, expect, it, vi } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import { decideTool, gateTool, splitToolName } from "./gate";

const tool = (name: string, extra: Partial<McpTool> = {}): McpTool => ({
  name,
  inputSchema: {},
  serverId: name.slice(0, name.indexOf("__")),
  ...extra,
});

const TOOLS = [
  tool("crm__search_clients"),
  tool("crm__send_invoice"),
  tool("crm__update_label"),
  tool("crm__ping", { annotations: { readOnlyHint: true } }),
];

describe("the write gate", () => {
  it("lets a read through without asking anyone", () => {
    expect(decideTool("crm__search_clients", TOOLS, "confirm")).toEqual({ verdict: "allow" });
    expect(decideTool("crm__ping", TOOLS, "confirm")).toEqual({ verdict: "allow" });
  });

  it("stops a write for a human when the policy is confirm", () => {
    expect(decideTool("crm__send_invoice", TOOLS, "confirm")).toMatchObject({ verdict: "confirm" });
  });

  it("rates a write on a server we do not ship as high — it cannot vouch for the semantics", () => {
    // `update_label` is the desktop's own example of a LOW-risk write; on a server the
    // catalogue has never seen, the risk still fails closed.
    expect(decideTool("crm__update_label", TOOLS, "confirm")).toEqual({
      verdict: "confirm",
      risk: "high",
    });
  });

  it("refuses a tool nobody advertised rather than treating it as a read", () => {
    expect(decideTool("crm__whatever", TOOLS, "allow")).toMatchObject({ verdict: "deny" });
  });

  it("deny refuses writes and still passes reads", () => {
    expect(decideTool("crm__send_invoice", TOOLS, "deny")).toMatchObject({ verdict: "deny" });
    expect(decideTool("crm__search_clients", TOOLS, "deny")).toEqual({ verdict: "allow" });
  });

  it("allow passes a write without a prompt — deliberate, and the card says so", () => {
    expect(decideTool("crm__send_invoice", TOOLS, "allow")).toEqual({ verdict: "allow" });
  });

  it("shows the human the REAL arguments, and refuses when the answer is no", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const stop = await gateTool("crm__send_invoice", TOOLS, "confirm", confirm, {
      to: "paul@vidal-avocats.fr",
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ args: { to: "paul@vidal-avocats.fr" }, risk: "high" }),
    );
    expect(stop).toMatch(/not approved/);
  });

  it("proceeds on a yes", async () => {
    expect(await gateTool("crm__send_invoice", TOOLS, "confirm", async () => true, {})).toBe("");
  });

  it("splits the namespaced name back into server and tool", () => {
    expect(splitToolName("crm__send_invoice")).toEqual({ serverId: "crm", bare: "send_invoice" });
    expect(splitToolName("bare")).toEqual({ serverId: "", bare: "bare" });
  });
});
