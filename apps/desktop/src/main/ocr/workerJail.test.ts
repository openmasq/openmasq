import { describe, expect, it } from "vitest";
import { workerCommand, workerSeatbelt } from "./workerJail";

const base = { node: "/r/node/node", nodeReal: "/real/node", script: "/r/sandboxed/extractWorker.mjs", read: ["/r/sandboxed", "/r/node"], write: ["/tmp/x"], memoryMb: 4096, heapMb: 3072 };

describe("the extraction worker's jail", () => {
  it("macOS: everything denied, then an allow-list: its program, its grants, its folder", () => {
    const p = workerSeatbelt({ read: ["/r", "/"], write: ["/tmp/x"], exec: "/real/node" });
    const lines = p.split("\n");
    expect(lines[1]).toBe("(deny default)");
    // nothing allowed wholesale: no network, no fork, no mach service, no broad read
    expect(p).not.toMatch(/^\(allow default\)$/m);
    expect(p).not.toMatch(/\(allow (network|process-fork|mach-lookup|file-read\*|file-read-data)[^ ]*\)$/m);
    expect(p).toContain('(allow process-exec (literal "/real/node"))');
    expect(p).toContain('(allow file-read* (subpath "/r"))'); // the whole disk is never a grant
    expect(p).toContain('(allow file-write* (literal "/dev/null") (subpath "/tmp/x"))');
    // code is mapped from the grants, never from the folder it writes
    expect(p).toContain('(allow file-map-executable (subpath "/r"))');
    expect(p.indexOf('(deny file-map-executable (subpath "/tmp/x"))')).toBeGreaterThan(p.indexOf("(allow file-map-executable"));
  });

  it("macOS: sandbox-exec runs the real Node under Node's permissions", () => {
    const c = workerCommand({ ...base, way: "seatbelt" });
    expect(c.cmd).toBe("/usr/bin/sandbox-exec");
    expect(c.args.slice(2, 5)).toEqual(["/real/node", "--max-old-space-size=3072", "--permission"]);
    expect(c.args).toContain("--allow-fs-read=/r/sandboxed");
    expect(c.args).toContain("--allow-fs-write=/tmp/x");
    expect(c.args.at(-1)).toBe("/r/sandboxed/extractWorker.mjs");
  });

  it("Windows: the launcher grants the same folders, caps memory, and Node takes paths as given", () => {
    const c = workerCommand({ ...base, way: "jail", jail: "C:/r/win-jail/x-jail.exe" });
    const dash = c.args.indexOf("--");
    expect(c.args.slice(0, dash)).toEqual(["--allow-read", "/r/sandboxed", "--allow-read", "/r/node", "--allow-write", "/tmp/x", "--memory-mb", "4096", "--active-processes", "8"]);
    expect(c.args.slice(dash + 1, dash + 6)).toEqual(["/r/node/node", "--preserve-symlinks", "--preserve-symlinks-main", "--max-old-space-size=3072", "--permission"]);
    expect(() => workerCommand({ ...base, way: "jail" })).toThrow();
  });
});
