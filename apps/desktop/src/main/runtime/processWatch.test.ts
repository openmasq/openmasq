import { spawn } from "node:child_process";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { folderWeight, treeRssKb, watchProcess } from "./processWatch";

const TABLE = `
    1     0   1000
  100     1   2000
  101   100 300000
  102   101 500000
  200     1 900000
`;

describe("the cap on a jailed child's memory and folder", () => {
  it("counts the child and everything it started, nothing beside it", () => {
    expect(treeRssKb(TABLE, 100)).toBe(802_000);
    expect(treeRssKb(TABLE, 102)).toBe(500_000);
    expect(treeRssKb(TABLE, 999)).toBe(0);
    expect(treeRssKb("garbage\n1 x 2\n", 1)).toBe(0);
  });

  it("weighs a folder without following a link out of it, and stops counting past its file cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omq-weight-"));
    writeFileSync(join(dir, "a"), Buffer.alloc(3000));
    writeFileSync(join(dir, "b"), Buffer.alloc(2000));
    symlinkSync("/usr", join(dir, "out")); // a link to a large folder weighs its own few bytes
    const w = await folderWeight(dir);
    expect(w.files).toBe(3);
    expect(w.bytes).toBeGreaterThanOrEqual(5000);
    expect(w.bytes).toBeLessThan(10_000);
    expect((await folderWeight(dir, 1)).files).toBe(2);
  });

  it.skipIf(process.platform === "win32")("a tree past its memory cap is said once, as memory", async () => {
    const said: string[] = [];
    const stop = watchProcess(100, { memoryMb: 500, everyMs: 5 }, (why) => said.push(why), async () => TABLE);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(said).toEqual(["memory"]);
  });

  it.skipIf(process.platform === "win32")("a tree under its cap is left alone; a folder past its weight is said as disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omq-weight-"));
    const said: string[] = [];
    const stop = watchProcess(100, { memoryMb: 4096, folder: dir, diskMb: 1, everyMs: 5 }, (why) => said.push(why), async () => TABLE);
    await new Promise((r) => setTimeout(r, 40));
    expect(said).toEqual([]);
    writeFileSync(join(dir, "big"), Buffer.alloc(2 * 1024 * 1024));
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(said).toEqual(["disk"]);
  });

  it.skipIf(process.platform === "win32")("a measure that cannot be taken, again and again, is treated as over (fail closed)", async () => {
    const said: string[] = [];
    const stop = watchProcess(100, { memoryMb: 4096, everyMs: 2 }, (why) => said.push(why), async () => null);
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(said).toEqual(["memory"]);
  });

  it.skipIf(process.platform === "win32")("live: a real child that allocates past its cap is caught by the real ps", async () => {
    // a Node that holds ~300 MB resident, against a 100 MB cap
    const child = spawn(process.execPath, ["-e", "const a=[];for(let i=0;i<30;i++)a.push(Buffer.alloc(10*1024*1024,1));setInterval(()=>{},1000)"], { stdio: "ignore" });
    const why = await new Promise<string>((resolve) => {
      const stop = watchProcess(child.pid, { memoryMb: 100, everyMs: 200 }, resolve);
      setTimeout(() => {
        stop();
        resolve("never");
      }, 15_000);
    });
    child.kill("SIGKILL");
    expect(why).toBe("memory");
  }, 20_000);
});
