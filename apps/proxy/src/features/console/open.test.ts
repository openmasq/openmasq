import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Running } from "../../lib/attach";
import { publishConsoleLink, readConsoleLink } from "./link";
import { runConsoleCommand } from "./open";

const URL_A = "http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g";
const dirs: string[] = [];
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), "openmasq-open-"));
  dirs.push(d);
  return join(d, "console.url");
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (path: string, running: Running | undefined, opens = true) => {
  const said: string[] = [];
  const printed: string[] = [];
  const opened: string[] = [];
  const probed: string[] = [];
  const run = (argv: string[] = []) =>
    runConsoleCommand(argv, {
      path,
      find: async (origin) => {
        probed.push(origin);
        return running;
      },
      open: async (u) => {
        opened.push(u);
        return opens;
      },
      say: (t) => said.push(t),
      out: (t) => printed.push(t),
    });
  return { run, said, printed, opened, probed };
};

describe("openmasq-proxy console", () => {
  it("opens the link of the proxy that answers for it — probing the origin, never the token", async () => {
    const path = fresh();
    publishConsoleLink(URL_A, path);
    const h = harness(path, { version: "1", model: false, console: true });
    expect(await h.run()).toBe(0);
    expect(h.probed).toEqual(["http://127.0.0.1:8787"]);
    expect(h.opened).toEqual([URL_A]);
    expect(h.said.join("\n")).toContain("live view opened");
  });

  it("prints the address with --url instead of opening it, for a keybinding of one's own", async () => {
    const path = fresh();
    publishConsoleLink(URL_A, path);
    const h = harness(path, { version: "1", model: false });
    expect(await h.run(["--url"])).toBe(0);
    expect(h.printed).toEqual([URL_A]);
    expect(h.opened).toEqual([]);
  });

  it("says when there is nothing to open, and why", async () => {
    const h = harness(fresh(), { version: "1", model: false, console: true });
    expect(await h.run()).toBe(1);
    expect(h.said.join("\n")).toContain("no proxy started with --console");
    expect(h.opened).toEqual([]);
  });

  it("forgets a stale link rather than opening it: nothing answers, or no console is served", async () => {
    const gone = fresh();
    publishConsoleLink(URL_A, gone);
    const h1 = harness(gone, undefined);
    expect(await h1.run()).toBe(1);
    expect(h1.said.join("\n")).toContain("is gone");
    expect(readConsoleLink(gone)).toBeUndefined();

    const noConsole = fresh();
    publishConsoleLink(URL_A, noConsole);
    const h2 = harness(noConsole, { version: "1", model: false, console: false });
    expect(await h2.run()).toBe(1);
    expect(h2.said.join("\n")).toContain("without --console");
    expect(readConsoleLink(noConsole)).toBeUndefined();
    expect(h2.opened).toEqual([]);
  });

  it("hands the address to the operator when no browser can be opened here", async () => {
    const path = fresh();
    publishConsoleLink(URL_A, path);
    const h = harness(path, { version: "1", model: false, console: true }, false);
    expect(await h.run()).toBe(1);
    expect(h.said.join("\n")).toContain(URL_A);
  });

  it("refuses an option it does not know, and prints its usage on --help", async () => {
    const h = harness(fresh(), undefined);
    expect(await h.run(["--verbose"])).toBe(2);
    expect(await h.run(["--help"])).toBe(0);
    expect(h.printed.join("\n")).toContain("openmasq-proxy console [--url]");
  });
});
