import { describe, expect, it, vi } from "vitest";
import { createMaskingGate, describeChange, type MaskingChange } from "./maskingGate";

/* The console is reached by a URL carrying a token, and that token authorises READING the
   log. Lowering a level is a different act -- reading shows what already crossed, lowering
   makes real data leave to a third party from then on -- so the gate stands between them,
   and only in that direction. */
const tty = (isTTY: boolean) => ({ isTTY }) as NodeJS.ReadStream;
const change = (before: MaskingChange["before"], after: MaskingChange["after"]): MaskingChange => ({
  connector: "notion",
  before,
  after,
});

function gate(answer: string, isTTY = true) {
  const notes: string[] = [];
  const readKey = vi.fn(async () => answer);
  return {
    notes,
    readKey,
    ask: createMaskingGate({ note: (t) => notes.push(t), stdin: tty(isTTY), readKey }),
  };
}

describe("tightening needs nobody's permission", () => {
  it.each([
    ["a higher level", { level: "standard" }, { level: "strict" }],
    ["a category no longer in clear", { level: "strict", disable: ["email"] }, { level: "strict" }],
    ["no change at all", { level: "renforce" }, { level: "renforce" }],
  ] as const)("applies %s without asking", async (_what, before, after) => {
    const g = gate("n");
    await expect(g.ask(change(before, after))).resolves.toEqual({ ok: true });
    expect(g.readKey).not.toHaveBeenCalled();
    expect(g.notes).toEqual([]);
  });
});

describe("loosening asks the terminal", () => {
  it("passes on a y", async () => {
    const g = gate("y");
    await expect(g.ask(change({ level: "strict" }, { level: "standard" }))).resolves.toEqual({
      ok: true,
    });
    expect(g.notes.join(" ")).toMatch(/mask LESS/);
  });

  it.each(["n", "\r", "", "Y ", ""])("refuses on %j", async (key) => {
    const g = gate(key);
    const v = await g.ask(change({ level: "strict" }, { level: "standard" }));
    expect(v.ok).toBe(false);
  });

  it("accepts an upper-case Y — one deliberate key, either shift", async () => {
    const g = gate("Y");
    await expect(g.ask(change({ level: "strict" }, { level: "standard" }))).resolves.toEqual({
      ok: true,
    });
  });

  /** The move a level-name comparison would wave through. */
  it("asks even when the level does not move, if a category leaves in clear", async () => {
    const g = gate("n");
    await g.ask(change({ level: "strict" }, { level: "strict", disable: ["email"] }));
    expect(g.readKey).toHaveBeenCalled();
  });

  it("asks when a value is newly kept in clear", async () => {
    const g = gate("n");
    await g.ask(change({ level: "strict" }, { level: "strict", keep: ["Acme"] }));
    expect(g.readKey).toHaveBeenCalled();
  });

  /**
   * ⚠️ NO TTY MEANS NO — a proxy under a service manager, in CI, or behind `-- <tool>` has
   * nobody to ask, and a prompt nobody answers must not fall open. The same call that a
   * terminal would merely postpone is refused outright here.
   */
  it("refuses without a terminal, and never waits for one", async () => {
    const g = gate("y", false);
    const v = await g.ask(change({ level: "strict" }, { level: "standard" }));
    expect(v).toEqual({ ok: false, why: expect.stringMatching(/needs a terminal/) });
    expect(g.readKey).not.toHaveBeenCalled();
  });

  /** …while TIGHTENING still works with no terminal: refusing to let someone protect more
   *  because nobody is watching would be the gate defeating its own purpose. */
  it("still lets a tightening through with no terminal", async () => {
    const g = gate("n", false);
    await expect(g.ask(change({ level: "standard" }, { level: "strict" }))).resolves.toEqual({
      ok: true,
    });
  });

  /** Queued, like the write gate: a `y` typed at an ambiguous moment must not approve a
   *  change the operator never read. */
  it("asks one at a time", async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const first = new Promise<void>((r) => (release = r));
    let n = 0;
    const ask = createMaskingGate({
      note: () => {},
      stdin: tty(true),
      readKey: async () => {
        order.push(`start${++n}`);
        if (n === 1) await first;
        order.push(`end${n}`);
        return "n";
      },
    });
    const a = ask(change({ level: "strict" }, { level: "standard" }));
    const b = ask(change({ level: "strict" }, { level: "standard" }));
    release?.();
    await Promise.all([a, b]);
    expect(order).toEqual(["start1", "end1", "start2", "end2"]);
  });
});

describe("what the operator is shown", () => {
  it("names the connector and what actually moves", () => {
    expect(describeChange(change({ level: "strict" }, { level: "standard" }))).toBe(
      "notion: strict → standard",
    );
    expect(
      describeChange(change({ level: "strict" }, { level: "strict", disable: ["email", "phone"] })),
    ).toBe("notion: strict, email, phone in clear");
  });

  it("says so plainly when the change is the run's own default", () => {
    const c = { ...change({ level: "strict" }, { level: "standard" }), connector: "" };
    expect(describeChange(c)).toBe("every connector: strict → standard");
  });
});
