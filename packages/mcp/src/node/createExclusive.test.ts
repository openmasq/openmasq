import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExclusive } from "./secretFile";

/** Two processes starting together each mint a key: only one may land on disk, the other
 *  reads it back — or the loser's ciphertext could never be decrypted again. */
const dirs: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), "omq-excl-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("createExclusive", () => {
  it("creates the file once, 0600, and never overwrites what is already there", () => {
    const p = join(dir(), "key");
    expect(createExclusive(p, "FIRST")).toBe(true);
    expect(createExclusive(p, "SECOND")).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("FIRST");
    if (process.platform !== "win32") expect(statSync(p).mode & 0o777).toBe(0o600);
  });
});
