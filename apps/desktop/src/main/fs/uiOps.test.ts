import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGrant } from "./grant";
import { UI_OPS } from "./uiOps";
import type { FsEntry } from "./protocol";

// The USER surface's search: it must serve the user's own documents, not the
// machine-managed trees that eat the result budget (a node_modules alone can hold
// 100k files). The skip is DESCENT-only — a matching name at the current level
// still shows — and UI-only (the model's `search_files` keeps full fidelity).

let base: string, root: string;
const bases: string[] = [];

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "fsui-")));
  bases.push(base);
  root = join(base, "root");
  mkdirSync(root, { recursive: true });
});
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

const g = () => makeGrant([root]);
const search = async (query: string): Promise<string[]> => {
  const r = (await UI_OPS.search!(g(), { path: root, query }, () => {})) as {
    entries: FsEntry[];
  };
  return r.entries.map((e) => e.name);
};

describe("UI search — dependency/VCS trees are not descended", () => {
  it("skips INTO node_modules/.git but still lists a matching name at this level", async () => {
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "rapport.txt"), "x");
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "rapport-config"), "x");
    writeFileSync(join(root, "rapport.pdf"), "x");

    const names = await search("rapport");
    expect(names).toContain("rapport.pdf");
    expect(names).not.toContain("rapport.txt"); // buried in node_modules
    expect(names).not.toContain("rapport-config"); // buried in .git
  });

  it("a skipped directory whose own NAME matches still appears", async () => {
    mkdirSync(join(root, "node_modules"), { recursive: true });
    expect(await search("node_mod")).toContain("node_modules");
  });

  it("ordinary subfolders are still walked", async () => {
    mkdirSync(join(root, "projets", "2026"), { recursive: true });
    writeFileSync(join(root, "projets", "2026", "devis-karl.pdf"), "x");
    expect(await search("devis")).toContain("devis-karl.pdf");
  });
});
