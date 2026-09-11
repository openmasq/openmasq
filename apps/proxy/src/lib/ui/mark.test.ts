import { describe, expect, it } from "vitest";
import { renderLockup } from "./mark";
import { createTty } from "./tty";

const lockup = (columns: number, colors = false) =>
  renderLockup(createTty(colors, () => columns, { depth: 24, theme: "dark" }), {
    version: "0.1.0",
    url: "http://127.0.0.1:8787",
  });

describe("the lockup", () => {
  /** A promise cut mid-word ("before it leaves t…") says something WEAKER about where the
   *  data goes than saying nothing: the shortest version that fits wins, and a very narrow
   *  terminal gets none — the card below states it in full either way. */
  it("never prints a truncated promise", () => {
    for (const columns of [120, 92, 76, 62, 50, 40]) {
      const lines = lockup(columns);
      expect(lines).toHaveLength(3);
      for (const l of lines) expect(l).not.toContain("…");
    }
    // Narrower than anything the card is drawn for: the promise goes silent, and the
    // version goes with it rather than cutting the name.
    expect(lockup(24)[2]).toBe("  ");
    expect(lockup(24)[0]).toBe("  OpenMasq proxy");
    expect(lockup(120)[2]).toContain("personal data is masked here");
    expect(lockup(62)[2]).toContain("masked before it leaves this machine");
  });

  it("drops the mark when the terminal has no colours, and keeps the name", () => {
    expect(lockup(92)[0]).toBe("  OpenMasq proxy  v0.1.0");
    const colored = lockup(92, true);
    expect(colored[1]).toContain("███████"); // the redaction bar, on the brand fill
    expect(colored[0]).toContain("OpenMasq");
  });
});
