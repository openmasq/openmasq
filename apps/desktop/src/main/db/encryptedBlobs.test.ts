import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir = "";
vi.mock("./paths", () => ({ filesDir: () => dir }));
vi.mock("@libsql/client", () => ({ createClient: vi.fn() }));
vi.mock("../store/dbCrypto", () => ({
  dbEncryptionKey: () => Buffer.alloc(32, 1),
  encryptBytes: (b: Uint8Array) => Buffer.concat([Buffer.from("ENC:"), Buffer.from(b)]),
  looksEncrypted: (b: Uint8Array) => Buffer.from(b).subarray(0, 4).toString() === "ENC:",
}));
const { ensureBlobsEncrypted } = await import("./encryptedMigration");

/** The at-rest sweep re-encrypts the saved blobs in place. A link sitting among them is not a
 *  blob: it is neither read nor written through — the file it points at stays untouched. */
let outside = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "omq-blobs-"));
  outside = await mkdtemp(join(tmpdir(), "omq-outside-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe("ensureBlobsEncrypted", () => {
  it("encrypts a plaintext blob in place", async () => {
    await writeFile(join(dir, "blob1"), "plain");
    await ensureBlobsEncrypted();
    expect((await readFile(join(dir, "blob1"), "utf8")).startsWith("ENC:")).toBe(true);
  });

  it.runIf(process.platform !== "win32")("never writes through a link to a file elsewhere", async () => {
    const target = join(outside, "other.txt");
    await writeFile(target, "someone else's file");
    await symlink(target, join(dir, "blob2"));
    await ensureBlobsEncrypted();
    expect(await readFile(target, "utf8")).toBe("someone else's file");
  });
});
