import { describe, expect, it } from "vitest";
import { mastheadRows, printMasthead } from "./masthead";
import { createTty } from "./tty";

describe("the subcommand masthead", () => {
  it("is one row of the mark, the name, the command and the version, then a hairline", () => {
    const tty = createTty(true, () => 80, { theme: "dark", depth: 24 });
    const rows = mastheadRows(tty, "config show", "0.1.0");
    expect(rows).toHaveLength(3);
    const plain = tty.strip(rows[0]);
    expect(plain).toContain("███████");
    expect(plain).toContain("OpenMasq proxy · config show");
    expect(plain.trimEnd().endsWith("v0.1.0")).toBe(true);
    expect(tty.width(rows[0])).toBeLessThanOrEqual(80);
    expect(tty.strip(rows[1]).trim()).toMatch(/^─+$/);
  });

  it("drops the mark without colours — a block of glyphs is noise — and keeps the words", () => {
    const tty = createTty(false, () => 80);
    const rows = mastheadRows(tty, "mcp status", "0.1.0");
    expect(rows[0]).toBe("  OpenMasq proxy · mcp status  v0.1.0");
    expect(rows[0]).not.toContain("█");
  });

  it("fits a narrow terminal by giving up the version before the command", () => {
    const tty = createTty(true, () => 44, { theme: "light", depth: 24 });
    const [first] = mastheadRows(tty, "config edit", "0.1.0");
    expect(tty.width(first)).toBeLessThanOrEqual(44);
    expect(tty.strip(first)).toContain("config edit");
  });

  it("writes to a terminal only: a pipe reading stdout gets nothing on stderr either", () => {
    const written: string[] = [];
    const pipe = {
      isTTY: false,
      write: (s: string) => written.push(s),
    } as unknown as NodeJS.WriteStream;
    printMasthead("config show", "0.1.0", { stream: pipe });
    expect(written).toEqual([]);
    const term = {
      isTTY: true,
      columns: 80,
      write: (s: string) => written.push(s),
    } as unknown as NodeJS.WriteStream;
    printMasthead("config show", "0.1.0", { stream: term, env: { NO_COLOR: "1" } });
    expect(written.join("")).toContain("OpenMasq proxy · config show");
  });
});
