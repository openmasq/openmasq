import { describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../config/config";
import { createMaskerSet } from "../../lib/maskers";
import { createPolicyReload } from "./policyReload";
import type { McpPolicy } from "./policy";

const CONFIG = { ...DEFAULTS, level: "standard" as const };

/** A reload driven by a file whose text the test supplies. */
function harness(initial: McpPolicy = {}) {
  const notes: string[] = [];
  const policy: McpPolicy = { ...initial };
  const maskers = createMaskerSet(CONFIG, policy);
  let text = "{}";
  const remask = createPolicyReload({
    maskers,
    policy,
    note: (t) => notes.push(t),
    path: "/p/proxy.json",
    read: () => text,
  });
  return { maskers, policy, notes, remask, write: (t: string) => (text = t) };
}

describe("re-reading proxy.json's mcp section under a running proxy", () => {
  it("applies a level a file gained, and says which server moved", () => {
    const h = harness();
    h.write('{"mcp":{"notion":{"level":"strict"}}}');
    expect(h.remask()).toEqual(["notion"]);
    expect(h.maskers.levelOf("notion")).toBe("strict");
  });

  it("reports nothing when the file changed somewhere this section does not read", () => {
    const h = harness({ notion: { level: "strict" } });
    h.write('{"run":{"port":9999},"mcp":{"notion":{"level":"strict"}}}');
    expect(h.remask()).toEqual([]);
    expect(h.maskers.levelOf("notion")).toBe("strict");
  });

  /**
   * ⚠️ The one that matters. A half-written file — an editor saving, a script mid-write — is
   * unreadable, and "unreadable" must never be read as "mask nothing": those are the same
   * bytes to a parser and opposite things to the person whose data is crossing.
   */
  it("keeps the masking it had when the file is broken, and says so once", () => {
    const h = harness({ notion: { level: "strict" } });
    h.write('{"mcp":{"notion":{"level":"str');
    expect(h.remask()).toEqual([]);
    expect(h.maskers.levelOf("notion")).toBe("strict");
    expect(h.notes.join(" ")).toMatch(/masking unchanged/);
  });

  it("keeps it when the section is valid JSON but says something impossible", () => {
    const h = harness({ notion: { level: "strict" } });
    h.write('{"mcp":{"notion":{"level":"strcit"}}}');
    expect(h.remask()).toEqual([]);
    expect(h.maskers.levelOf("notion")).toBe("strict");
    expect(h.notes.join(" ")).toMatch(/standard, renforce or strict/);
  });

  it("lets a server go back to following the run", () => {
    const h = harness({ notion: { level: "strict" } });
    h.write('{"mcp":{}}');
    expect(h.remask()).toEqual(["notion"]);
    expect(h.maskers.forServer("notion")).toBe(h.maskers.masker);
  });

  /** The bridge holds the reference it was given at start, so the object is refilled rather
   *  than replaced — otherwise an edited `writes` would never reach the gate. */
  it("updates the policy object the write gate reads, in place", () => {
    const h = harness({ notion: { writes: "confirm" } });
    const held = h.policy;
    h.write('{"mcp":{"notion":{"writes":"deny"},"github":{"writes":"allow"}}}');
    h.remask();
    expect(held).toBe(h.policy);
    expect(held.notion?.writes).toBe("deny");
    expect(held.github?.writes).toBe("allow");
  });

  it("drops an entry the file no longer carries", () => {
    const h = harness({ notion: { writes: "deny" } });
    h.write('{"mcp":{}}');
    h.remask();
    expect(h.policy.notion).toBeUndefined();
  });

  it("reads the file each time — a watcher fires on the file, not on a cache", () => {
    const h = harness();
    const read = vi.fn(() => '{"mcp":{"notion":{"level":"strict"}}}');
    const remask = createPolicyReload({
      maskers: h.maskers,
      policy: h.policy,
      note: () => {},
      path: "/p/proxy.json",
      read,
    });
    remask();
    remask();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
