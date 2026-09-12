import { describe, expect, it } from "vitest";
import { editConfig, editorCommand, initConfig, SCHEMA_FILE, skeleton } from "./edit";

/** An in-memory disk, so the tests never touch ~/.openmasq. */
const disk = (seed: Record<string, string> = {}) => {
  const files = new Map(Object.entries(seed));
  const dirs: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  return {
    files,
    dirs,
    out,
    err,
    deps: {
      out: (t: string) => out.push(t),
      err: (t: string) => err.push(t),
      exists: (p: string) => files.has(p),
      read: (p: string) => files.get(p),
      write: (p: string, text: string) => void files.set(p, text),
      mkdir: (d: string) => void dirs.push(d),
    },
  };
};

const FILE = "/home/u/.openmasq/proxy.json";
const SCHEMA = `/home/u/.openmasq/${SCHEMA_FILE}`;

describe("config init", () => {
  it("writes the empty file with its schema beside it, in a directory it creates", () => {
    const d = disk();
    expect(initConfig(FILE, d.deps)).toBe(0);
    expect(d.dirs).toEqual(["/home/u/.openmasq"]);
    expect(JSON.parse(d.files.get(FILE) ?? "")).toEqual({
      $schema: `./${SCHEMA_FILE}`,
      run: {},
      clients: {},
      mcp: {},
    });
    const schema = JSON.parse(d.files.get(SCHEMA) ?? "") as { properties: { run: unknown } };
    expect(schema.properties.run).toBeDefined();
    expect(d.out[0]).toContain(FILE);
    expect(skeleton(SCHEMA)).toContain(`"./${SCHEMA_FILE}"`);
  });

  it("refuses to overwrite the user's own file", () => {
    const d = disk({ [FILE]: '{"run":{"level":"strict"}}' });
    expect(initConfig(FILE, d.deps)).toBe(1);
    expect(d.files.get(FILE)).toBe('{"run":{"level":"strict"}}');
    expect(d.err[0]).toMatch(/already exists/);
  });
});

describe("config edit", () => {
  it("opens $VISUAL over $EDITOR, splitting an editor's own flags, whatever is installed", () => {
    const all = () => true;
    expect(editorCommand({ VISUAL: "code --wait", EDITOR: "vim" }, "darwin", all)).toEqual([
      "code",
      "--wait",
    ]);
    expect(editorCommand({ EDITOR: "nano" }, "darwin", all)).toEqual(["nano"]);
    // npm exports its own default editor as EDITOR=vi into `npx …`; that is not the user's word.
    const npx = { EDITOR: "vi", npm_execpath: "/x/npm-cli.js" };
    expect(editorCommand(npx, "darwin", (c) => c === "code")).toEqual(["code", "--wait"]);
    expect(editorCommand({ EDITOR: "vi" }, "darwin", (c) => c === "code")).toEqual(["vi"]); // typed by the user: kept
    expect(editorCommand({ EDITOR: "nano", npm_execpath: "/x" }, "darwin", all)).toEqual(["nano"]);
  });

  it("with none named, takes the first real editor installed — a desktop one with --wait — and vi as the last resort", () => {
    const only =
      (...names: string[]) =>
      (c: string) =>
        names.includes(c);
    expect(editorCommand({}, "darwin", only("code", "vim"))).toEqual(["code", "--wait"]);
    expect(editorCommand({}, "darwin", only("cursor", "code"))).toEqual(["cursor", "--wait"]);
    expect(editorCommand({}, "linux", only("nano", "vi"))).toEqual(["nano"]);
    expect(editorCommand({}, "linux", only())).toEqual(["vi"]);
    expect(editorCommand({}, "win32", only())).toEqual(["notepad"]);
    expect(editorCommand({}, "win32", only("code"))).toEqual(["code", "--wait"]);
    // macOS, VS Code installed as an app but without its shell command: the bundle's own CLI.
    const bundle = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
    expect(editorCommand({}, "darwin", only(bundle, "nano"))).toEqual([bundle, "--wait"]);
    expect(editorCommand({}, "linux", only(bundle, "nano"))).toEqual(["nano"]); // a Mac path means nothing there
  });

  it("creates the file when there is none, runs the editor on it, and checks what was saved", () => {
    const d = disk();
    const ran: string[][] = [];
    const code = editConfig(FILE, {
      ...d.deps,
      env: { EDITOR: "nano" },
      spawn: (cmd, args) => {
        ran.push([cmd, ...args]);
        // The user types a valid file.
        d.files.set(FILE, '{"run":{"level":"renforce"},"mcp":{"notion":{"writes":"deny"}}}');
        return 0;
      },
    });
    expect(ran).toEqual([["nano", FILE]]);
    expect(d.files.has(SCHEMA)).toBe(true); // init ran first
    expect(d.out.some((l) => l.startsWith(`opening ${FILE} in nano`))).toBe(true);
    expect(code).toBe(0);
    expect(d.out.at(-1)).toMatch(/valid/);
  });

  it("refuses what the run would refuse, and says how to come back", () => {
    const d = disk({ [FILE]: "{}" });
    const code = editConfig(FILE, {
      ...d.deps,
      env: {},
      spawn: () => {
        d.files.set(FILE, '{"run":{"levl":"strict"}}');
        return 0;
      },
    });
    expect(code).toBe(1);
    expect(d.err[0]).toMatch(/did you mean "level"/);
    expect(d.err[0]).toMatch(/config edit/);
    // …and a bad `mcp` section is caught the same way.
    const bad = disk({ [FILE]: "{}" });
    expect(
      editConfig(FILE, {
        ...bad.deps,
        env: {},
        spawn: () => {
          bad.files.set(FILE, '{"mcp":{"notion":{"source":"mine"}}}');
          return 0;
        },
      }),
    ).toBe(1);
    expect(bad.err[0]).toMatch(/openmasq, client or off/);
  });

  it("does not claim a check it could not make when the editor fails", () => {
    const d = disk({ [FILE]: "{}" });
    expect(editConfig(FILE, { ...d.deps, env: { EDITOR: "vim" }, spawn: () => 1 })).toBe(1);
    expect(d.err[0]).toMatch(/vim exited with status 1 — the file was not checked/);
  });
});
