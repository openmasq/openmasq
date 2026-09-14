import { describe, expect, it } from "vitest";
import { collapseByValue, hiddenByCollapse, type DataRow } from "./unique";

/* An agent re-sends its whole conversation on every turn, so a value masked once is masked
   again in every later call. Measured on a real session: the same e-mail, key and address
   twenty times down the view, with the two substitutes that appeared once scrolled away
   between them. */
const row = (t: string, tok: string, n = 1, ses = "claude-a1"): DataRow => ({
  t,
  ses,
  it: { tok, cat: "secrets", type: "Keys & secrets", n },
});

describe("one row per value", () => {
  it("keeps the FIRST crossing, which is the moment a reader is looking for", () => {
    const out = collapseByValue([
      row("08:38:13", "gdah@gmail.com"),
      row("08:38:16", "gdah@gmail.com"),
      row("08:39:51", "gdah@gmail.com"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.t).toBe("08:38:13");
  });

  /** A value in twenty calls and one repeated twenty times INSIDE a call are different
   *  facts; the view must not pass one off as the other. */
  it("counts the occurrences and the calls apart", () => {
    const out = collapseByValue([row("08:00", "k", 3), row("08:01", "k", 2)]);
    expect(out[0]).toMatchObject({ total: 5, calls: 2 });
    const once = collapseByValue([row("08:00", "k", 4)]);
    expect(once[0]).toMatchObject({ total: 4, calls: 1 });
  });

  /**
   * ⚠️ THE one that must never be got wrong. Each wrapped client has its OWN vault, so the
   * same fake string in two sessions stands for two DIFFERENT real values. Merging them
   * would claim one value where there are two — the one thing a privacy log may not do.
   */
  it("never merges two sessions that happen to share a substitute", () => {
    const out = collapseByValue([
      row("08:00", "Mattéo Pons", 1, "claude-a1"),
      row("08:01", "Mattéo Pons", 1, "codex-b2"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.ses)).toEqual(["claude-a1", "codex-b2"]);
  });

  it("cannot be fooled by a session id and a substitute spelling the same key", () => {
    const a = { t: "08:00", ses: "a", it: { tok: "b c", n: 1 } };
    const b = { t: "08:01", ses: "a b", it: { tok: "c", n: 1 } };
    expect(collapseByValue([a, b])).toHaveLength(2);
  });

  it("keeps distinct values distinct, in the order they first appeared", () => {
    const out = collapseByValue([row("08:00", "b"), row("08:01", "a"), row("08:02", "b")]);
    expect(out.map((r) => r.it.tok)).toEqual(["b", "a"]);
  });

  it("drops what has nothing to identify it by, as the expanded view does", () => {
    expect(collapseByValue([{ t: "08:00", it: {} }, row("08:01", "k")])).toHaveLength(1);
  });

  it("treats a run that wrapped nobody as one session", () => {
    const out = collapseByValue([
      { t: "08:00", it: { tok: "k", n: 1 } },
      { t: "08:01", it: { tok: "k", n: 1 } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.total).toBe(2);
  });
});

describe("what the toggle can say it is doing", () => {
  it("counts the rows it hid", () => {
    const rows = [row("08:00", "k"), row("08:01", "k"), row("08:02", "j")];
    expect(hiddenByCollapse(rows, collapseByValue(rows))).toBe(1);
  });

  /** Nothing repeated ⇒ the filter did nothing, and saying otherwise would claim a
   *  reduction that never happened. */
  it("is zero when nothing repeated", () => {
    const rows = [row("08:00", "k"), row("08:01", "j")];
    expect(hiddenByCollapse(rows, collapseByValue(rows))).toBe(0);
    expect(hiddenByCollapse([], [])).toBe(0);
  });
});
