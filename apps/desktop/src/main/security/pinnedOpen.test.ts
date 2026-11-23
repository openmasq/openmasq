import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, symlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { openPinned } from "./pinnedOpen";
import { isWithin } from "./pathScope";

// base/allowed/dir/doc.txt   <- the file the gate allows
// base/secret/dir/doc.txt    <- a gate-REFUSED file at the same relative name
let base: string, allowedRoot: string, doc: string;
const gate = (r: string) => isWithin(allowedRoot, r);

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "pinned-")));
  allowedRoot = join(base, "allowed");
  mkdirSync(join(allowedRoot, "dir"), { recursive: true });
  mkdirSync(join(base, "secret", "dir"), { recursive: true });
  doc = join(allowedRoot, "dir", "doc.txt");
  writeFileSync(doc, "OK");
  writeFileSync(join(base, "secret", "dir", "doc.txt"), "DUMMY-SECRET-CANARY");
});

describe("openPinned — the descriptor is authorized, not a path checked earlier", () => {
  it("reads an allowed regular file", async () => {
    const { fh } = await openPinned(doc, gate);
    try {
      expect((await fh.readFile()).toString()).toBe("OK");
    } finally {
      await fh.close();
    }
  });

  it("refuses a path outside the gate", async () => {
    await expect(openPinned(join(base, "secret", "dir", "doc.txt"), gate)).rejects.toThrow(/refusé/);
  });

  it("refuses when a PARENT directory is swapped for a link (O_NOFOLLOW alone follows it)", async () => {
    // The gate saw allowed/dir/doc.txt; then dir/ is replaced by a link to secret/dir.
    let calls = 0;
    const swapAfterFirstCheck = (r: string) => {
      if (calls++ === 0) {
        renameSync(join(allowedRoot, "dir"), join(allowedRoot, "dir.orig"));
        symlinkSync(join(base, "secret", "dir"), join(allowedRoot, "dir"));
      }
      return gate(r);
    };
    await expect(openPinned(doc, swapAfterFirstCheck)).rejects.toThrow(/refusé/);
  });

  it("refuses a final-component link and a FIFO", async () => {
    const link = join(allowedRoot, "link.txt");
    symlinkSync(join(base, "secret", "dir", "doc.txt"), link);
    await expect(openPinned(link, gate)).rejects.toThrow(/refusé/);
    if (process.platform === "win32") return;
    const fifo = join(allowedRoot, "pipe");
    execFileSync("mkfifo", [fifo]);
    await expect(openPinned(fifo, gate)).rejects.toThrow(/fichier/);
  });
});
