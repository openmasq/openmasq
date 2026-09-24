import { describe, expect, it, vi } from "vitest";
import { createApplyMasking } from "./applyMasking";
import type { GateVerdict, MaskingChange } from "./maskingGate";

const PASS = async (): Promise<GateVerdict> => ({ ok: true });
const REFUSE = async (): Promise<GateVerdict> => ({ ok: false, why: "not approved" });

function harness(file: string, gate = PASS) {
  let text = file;
  const asked: MaskingChange[] = [];
  const remask = vi.fn(() => ["notion"]);
  const write = vi.fn((_p: string, t: string) => {
    text = t;
  });
  const apply = createApplyMasking({
    gate: (c) => {
      asked.push(c);
      return gate(c);
    },
    defaultLevel: () => "standard",
    remask,
    path: "/p/proxy.json",
    read: () => text,
    write,
  });
  return { apply, asked, remask, write, now: () => JSON.parse(text) };
}

describe("applying a masking change from the live view", () => {
  it("writes the level and re-points the maskers", async () => {
    const h = harness('{"run":{},"mcp":{}}');
    await expect(h.apply("notion", { level: "strict" })).resolves.toEqual({
      ok: true,
      moved: ["notion"],
    });
    expect(h.now().mcp.notion).toEqual({ level: "strict" });
    expect(h.remask).toHaveBeenCalled();
  });

  /** The gate compares what IS to what is asked, with the run's level folded in for a
   *  connector that says nothing of its own. */
  it("asks the gate with the run's level as the starting point", async () => {
    const h = harness('{"mcp":{}}');
    await h.apply("notion", { level: "strict" });
    expect(h.asked[0]).toMatchObject({
      connector: "notion",
      before: { level: "standard" },
      after: { level: "strict" },
    });
  });

  /**
   * ⚠️ Order. A refusal must leave NOTHING on disk — a change nobody approved sitting in the
   * file would be picked up by the next restart, which is the gate defeated by patience.
   */
  it("writes nothing and applies nothing when the gate refuses", async () => {
    const h = harness('{"mcp":{"notion":{"level":"strict"}}}', REFUSE);
    await expect(h.apply("notion", { level: "standard" })).resolves.toEqual({
      ok: false,
      why: "not approved",
    });
    expect(h.write).not.toHaveBeenCalled();
    expect(h.remask).not.toHaveBeenCalled();
    expect(h.now().mcp.notion.level).toBe("strict");
  });

  /** `proxy.json` is the operator's own file. A page that flattened their `run` block to
   *  change a level would be a worse bug than the one it fixed. */
  it("leaves every other section of the file alone", async () => {
    const h = harness(
      '{"run":{"port":8788,"level":"renforce"},"clients":{"claude":{"mcp":true}},"mcp":{}}',
    );
    await h.apply("notion", { level: "strict" });
    const doc = h.now();
    expect(doc.run).toEqual({ port: 8788, level: "renforce" });
    expect(doc.clients).toEqual({ claude: { mcp: true } });
  });

  /** `source` and `writes` are not masking, and this page has no business touching them. */
  it("keeps the keys it is not about", async () => {
    const h = harness('{"mcp":{"notion":{"source":"openmasq","writes":"deny"}}}');
    await h.apply("notion", { level: "strict" });
    expect(h.now().mcp.notion).toEqual({ source: "openmasq", writes: "deny", level: "strict" });
  });

  it("removes the level when the picker says follow the default", async () => {
    const h = harness('{"mcp":{"notion":{"level":"strict","source":"openmasq"}}}');
    await h.apply("notion", { level: null as never });
    expect(h.now().mcp.notion).toEqual({ source: "openmasq" });
  });

  it("refuses to touch a file it cannot read, rather than overwrite it", async () => {
    const h = harness('{"mcp":{"notion":{"level":"str');
    const r = await h.apply("notion", { level: "strict" });
    expect(r).toEqual({ ok: false, why: expect.stringMatching(/could not be read/) });
    expect(h.write).not.toHaveBeenCalled();
  });

  it("refuses a file whose mcp section is already invalid", async () => {
    const h = harness('{"mcp":{"notion":{"level":"strcit"}}}');
    const r = await h.apply("notion", { level: "strict" });
    expect(r).toEqual({ ok: false, why: expect.stringMatching(/is not valid/) });
    expect(h.write).not.toHaveBeenCalled();
  });

  it("reports a write that failed instead of claiming success", async () => {
    const apply = createApplyMasking({
      gate: PASS,
      defaultLevel: () => "standard",
      remask: () => [],
      path: "/p/proxy.json",
      read: () => '{"mcp":{}}',
      write: () => {
        throw new Error("read-only file system");
      },
    });
    await expect(apply("notion", { level: "strict" })).resolves.toEqual({
      ok: false,
      why: expect.stringMatching(/read-only file system/),
    });
  });
});
