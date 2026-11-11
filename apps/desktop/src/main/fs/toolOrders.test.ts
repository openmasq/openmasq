import { describe, expect, it } from "vitest";
import { sep } from "node:path";
import { assertNotHiddenByLink, isToolOrders, runByTools, writeHazard } from "./toolOrders";

describe("runByTools — where a write is not an ordinary write", () => {
  it("names anything hidden, at any depth, existing or not", () => {
    for (const p of [
      "/Users/a/proj/.vscode/tasks.json",
      "/Users/a/proj/.git/hooks/pre-commit",
      "/Users/a/proj/.github/workflows/x.yml",
      "/Users/a/proj/.claude/settings.local.json",
      "/Users/a/proj/.env",
      "/Users/a/proj/.husky/pre-push",
      "C:\\Users\\a\\proj\\.vscode\\tasks.json",
    ]) {
      expect(runByTools(p), p).toBe("hidden");
    }
  });

  it("names what a tool reads as orders, case and trailing dots ignored", () => {
    for (const name of [
      "package.json", "Package.JSON", "package.json.", "Makefile", "Dockerfile", "docker-compose.override.yml",
      "pyproject.toml", "conftest.py", "vite.config.ts", "tsconfig.build.json", "requirements-dev.txt",
      "CLAUDE.md", "AGENTS.md", "GEMINI.md", "SKILL.md", "copilot-instructions.md", "review.prompt.md", "mcp.json",
      "lefthook.yml", "action.yml",
    ]) {
      expect(isToolOrders(name), name).toBe(true);
      expect(runByTools(`/Users/a/proj/${name}`), name).toBe("orders");
    }
  });

  it("names installed code by the folder it sits in", () => {
    expect(runByTools("/Users/a/proj/node_modules/left-pad/index.js")).toBe("installed");
    expect(runByTools("/Users/a/proj/venv/lib/site-packages/x/__init__.py")).toBe("installed");
  });

  it("leaves a document alone, a dot INSIDE a name included", () => {
    for (const p of [
      "/Users/john.doe/Documents/notes.md",
      "/Users/a/proj/README.md",
      "/Users/a/proj/docs/rapport v1.2.docx",
      "/Users/a/proj/src/index.ts",
      "/Users/a/proj/data.json",
      "/Users/a/vendor.md", // a FILE named like an installed folder is not inside one
    ]) {
      expect(runByTools(p), p).toBeNull();
    }
  });
});

describe("writeHazard — the mutating ops and their path arguments", () => {
  it("judges the destination of a write, an edit and a new folder", () => {
    expect(writeHazard("write_file", { path: "/p/.vscode/tasks.json", content: "{}" })).toEqual({ path: "/p/.vscode/tasks.json", why: "hidden" });
    expect(writeHazard("edit_file", { path: "/p/package.json" })?.why).toBe("orders");
    expect(writeHazard("create_directory", { path: "/p/.github/workflows" })?.why).toBe("hidden");
    expect(writeHazard("write_file", { path: "/p/notes.md" })).toBeNull();
  });

  it("judges BOTH ends of a move: the two-step that arms a hook or a manifest", () => {
    // written as a note, then moved where it runs
    expect(writeHazard("move_file", { source: "/p/a.json", destination: "/p/.vscode/tasks.json" })?.why).toBe("hidden");
    expect(writeHazard("move_file", { source: "/p/notes.json", destination: "/p/package.json" })?.why).toBe("orders");
    // a sample hook (already executable) renamed into a live one
    expect(writeHazard("move_file", { source: "/p/.git/hooks/pre-commit.sample", destination: "/p/.git/hooks/pre-commit" })?.why).toBe("hidden");
    expect(writeHazard("rename", { source: "/p/a.md", destination: "/p/AGENTS.md" })?.why).toBe("orders");
    expect(writeHazard("move_file", { source: "/p/a.md", destination: "/p/b.md" })).toBeNull();
  });

  it("says nothing of a read, nor of arguments it cannot read", () => {
    expect(writeHazard("read_file", { path: "/p/.env" })).toBeNull();
    expect(writeHazard("write_file", null)).toBeNull();
    expect(writeHazard("write_file", { path: 42 })).toBeNull();
  });
});

describe("assertNotHiddenByLink — the worker's half, on the real path", () => {
  const root = `${sep}Users${sep}a${sep}proj`;
  const at = (...parts: string[]) => [root, ...parts].join(sep);

  it("refuses an innocent name a link turned into a hook", () => {
    // notes -> .git/hooks : main saw « notes/pre-commit » and asked nothing
    expect(() => assertNotHiddenByLink(at("notes", "pre-commit"), at(".git", "hooks", "pre-commit"), [root])).toThrow(/lien/);
    expect(() => assertNotHiddenByLink(at("doc.json"), at("package.json"), [root])).toThrow(/lien/);
  });

  it("lets through what main was shown, and an ordinary file", () => {
    // main judged this very path (and asked): the worker does not ask twice
    expect(() => assertNotHiddenByLink(at(".vscode", "tasks.json"), at(".vscode", "tasks.json"), [root])).not.toThrow();
    expect(() => assertNotHiddenByLink(at("notes.md"), at("notes.md"), [root])).not.toThrow();
  });

  it("judges below the granted root: a folder granted on purpose is not second-guessed", () => {
    const hiddenRoot = `${sep}Users${sep}a${sep}.notes`;
    expect(() => assertNotHiddenByLink(`${sep}Users${sep}a${sep}n${sep}a.md`, `${hiddenRoot}${sep}a.md`, [hiddenRoot])).not.toThrow();
  });
});
