import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { link, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFiles, collectImages } from "./collect";

/**
 * MAIN reads the run's outputs UNJAILED, so nothing the child left in its scratch may lead it
 * outside: not a link in place of `out/` or `figures/`, not a link or a hardlink in place of a
 * file. The "secret" folder below stands for what the jail denies (the accounts, `mcp.json`).
 */
let root: string;
let scratch: string;
let secret: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "omq-collect-")));
  scratch = join(root, "scratch");
  secret = join(root, "secret");
  await mkdir(join(scratch, "out"), { recursive: true });
  await mkdir(join(scratch, "figures"), { recursive: true });
  await mkdir(secret);
  await writeFile(join(secret, "accounts.json"), '{"token":"REAL-SECRET"}');
  await writeFile(join(secret, "fig_1.png"), "PNG-SECRET");
});
afterEach(() => rm(root, { recursive: true, force: true }));

const posix = process.platform !== "win32";

describe("the run's outputs, read back by main", () => {
  it("collects a real deliverable", async () => {
    await writeFile(join(scratch, "out", "rapport.md"), "# ok");
    const files = await collectFiles(join(scratch, "out"));
    expect(files.map((f) => f.name)).toEqual(["rapport.md"]);
  });

  it.runIf(posix)("hands back NOTHING when `out/` was replaced by a link to another folder", async () => {
    await rename(join(scratch, "out"), join(scratch, "was-out"));
    await symlink(secret, join(scratch, "out"));
    const files = await collectFiles(join(scratch, "out"));
    expect(files).toEqual([]);
    expect(JSON.stringify(files)).not.toContain("REAL-SECRET");
  });

  it.runIf(posix)("hands back NOTHING when `figures/` was replaced by a link", async () => {
    await rm(join(scratch, "figures"), { recursive: true });
    await symlink(secret, join(scratch, "figures"));
    expect(await collectImages(join(scratch, "figures"))).toEqual([]);
  });

  it.runIf(posix)("skips a deliverable that is a link to a file outside", async () => {
    await symlink(join(secret, "accounts.json"), join(scratch, "out", "rapport.json"));
    await writeFile(join(scratch, "out", "vrai.txt"), "ok");
    const files = await collectFiles(join(scratch, "out"));
    expect(files.map((f) => f.name)).toEqual(["vrai.txt"]);
  });

  it.runIf(posix)("skips a hardlink to a file outside (it aliases another path)", async () => {
    await link(join(secret, "accounts.json"), join(scratch, "out", "copie.json"));
    expect(await collectFiles(join(scratch, "out"))).toEqual([]);
  });

  it("an absent directory collects nothing, without throwing", async () => {
    expect(await collectFiles(join(scratch, "nowhere"))).toEqual([]);
  });
});
