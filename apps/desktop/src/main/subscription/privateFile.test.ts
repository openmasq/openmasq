// The system prompt crosses to the CLI through a file: never argv, never a shared path,
// never left behind.
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { writePrivateFile } from "./privateFile";

describe("writePrivateFile", () => {
  it("writes the text in its own fresh directory, brand-prefixed", () => {
    const f = writePrivateFile("system.txt", "Tu es concis.");
    expect(readFileSync(f.path, "utf8")).toBe("Tu es concis.");
    expect(dirname(f.path)).toMatch(/-cli-input-[^/\\]+$/);
    f.remove();
  });

  it.skipIf(process.platform === "win32")("directory 0700, file 0600: no other account reads it", () => {
    const f = writePrivateFile("system.txt", "x");
    expect(statSync(dirname(f.path)).mode & 0o777).toBe(0o700);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
    f.remove();
  });

  it("remove() deletes the directory, is idempotent and never throws", () => {
    const f = writePrivateFile("system.txt", "x");
    f.remove();
    expect(existsSync(dirname(f.path))).toBe(false);
    expect(() => f.remove()).not.toThrow();
  });

  it("two turns never share a path", () => {
    const a = writePrivateFile("system.txt", "a");
    const b = writePrivateFile("system.txt", "b");
    expect(a.path).not.toBe(b.path);
    a.remove();
    b.remove();
  });

  it("creates EXCLUSIVELY: it never writes through a file that is already there", () => {
    // `wx` is what refuses a pre-planted path; pinned on the flag's own behaviour.
    const dir = mkdtempSync(join(tmpdir(), "om-wx-"));
    writeFileSync(join(dir, "f"), "planted");
    expect(() => writeFileSync(join(dir, "f"), "x", { flag: "wx" })).toThrow(/EEXIST/);
  });
});
