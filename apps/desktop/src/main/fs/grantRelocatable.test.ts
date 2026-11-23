import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGrant } from "./grant";
import { TOOL_OPS as toolOps } from "./toolOps";
import { UI_OPS as uiOps } from "./uiOps";

// home/                 <- the GRANTED root (the picker suggests ~)
//   AppSupport/Vendor/  <- a plain, renameable folder
//     secret/token      <- a DENIED path beneath it
//   notes.txt
let home: string, vendor: string, denied: string;

beforeEach(() => {
  home = join(realpathSync(mkdtempSync(join(tmpdir(), "fsreloc-"))), "home");
  vendor = join(home, "AppSupport", "Vendor");
  denied = join(vendor, "secret");
  mkdirSync(denied, { recursive: true });
  writeFileSync(join(denied, "token"), "DUMMY-CANARY");
  writeFileSync(join(home, "notes.txt"), "n");
});

describe("Grant.resolveRelocatable — a subtree holding a denied path is never moved", () => {
  it("refuses an ancestor of a denied entry, accepts an ordinary path", () => {
    const g = makeGrant([home], [denied]);
    expect(() => g.resolveRelocatable(vendor)).toThrow(/protégé/);
    expect(() => g.resolveRelocatable(join(home, "AppSupport"))).toThrow(/protégé/);
    expect(g.resolveRelocatable(join(home, "notes.txt"))).toBe(join(home, "notes.txt"));
    // listing/search on the broad root keeps working
    expect(g.resolve(home)).toBe(home);
  });

  it("is case-folded where the volume ignores case", () => {
    if (process.platform !== "darwin" && process.platform !== "win32") return;
    const g = makeGrant([home], [denied.toUpperCase()]);
    expect(() => g.resolveRelocatable(vendor)).toThrow(/protégé/);
  });

  it("move_file (model) cannot relocate the ancestor, so the denied file stays unreadable", async () => {
    const g = makeGrant([home], [denied]);
    await expect(toolOps.move_file!(g, { source: vendor, destination: join(home, "Moved") })).rejects.toThrow(/protégé/);
    expect(existsSync(join(home, "Moved"))).toBe(false);
    expect(readFileSync(join(denied, "token"), "utf8")).toBe("DUMMY-CANARY");
  });

  it("move_file cannot plant a crafted folder onto a denied path's ancestor", async () => {
    const g = makeGrant([home], [join(home, "AppSupport", "Other", "secret")]);
    mkdirSync(join(home, "crafted", "secret"), { recursive: true });
    await expect(
      toolOps.move_file!(g, { source: join(home, "crafted"), destination: join(home, "AppSupport", "Other") }),
    ).rejects.toThrow(/protégé/);
  });

  it("rename (renderer) applies the same check", async () => {
    const g = makeGrant([home], [denied]);
    await expect(uiOps.rename!(g, { source: vendor, destination: join(home, "Moved") }, () => {})).rejects.toThrow(/protégé/);
    await expect(uiOps.rename!(g, { source: join(home, "notes.txt"), destination: join(home, "n2.txt") }, () => {})).resolves.toEqual({
      path: join(home, "n2.txt"),
    });
  });
});
