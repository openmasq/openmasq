import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRegular } from "./fdRead";

/** A granted read is checked and read on ONE descriptor: the name is never followed as a link,
 *  never waited on as a FIFO, never read as something that is not a file. */
let dir = "";
afterEach(() => (dir ? rm(dir, { recursive: true, force: true }) : undefined));
const posix = process.platform !== "win32";

describe("openRegular", () => {
  it("opens a regular file and reports its size on the descriptor", async () => {
    dir = await mkdtemp(join(tmpdir(), "omq-fd-"));
    await writeFile(join(dir, "a.txt"), "hello");
    const { fh, st } = await openRegular(join(dir, "a.txt"));
    expect(st.size).toBe(5);
    expect(await fh.readFile({ encoding: "utf8" })).toBe("hello");
    await fh.close();
  });

  it.runIf(posix)("never follows a link in place of the file", async () => {
    dir = await mkdtemp(join(tmpdir(), "omq-fd-"));
    await writeFile(join(dir, "secret"), "SECRET");
    await symlink(join(dir, "secret"), join(dir, "a.txt"));
    await expect(openRegular(join(dir, "a.txt"))).rejects.toThrow();
  });

  it.runIf(posix)("refuses a FIFO without waiting on it", async () => {
    dir = await mkdtemp(join(tmpdir(), "omq-fd-"));
    execFileSync("mkfifo", [join(dir, "pipe")]);
    await expect(openRegular(join(dir, "pipe"))).rejects.toThrow(/pas un fichier/);
  });

  it("refuses a directory", async () => {
    dir = await mkdtemp(join(tmpdir(), "omq-fd-"));
    await mkdir(join(dir, "d"));
    await expect(openRegular(join(dir, "d"))).rejects.toThrow();
  });
});
