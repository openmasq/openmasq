// The extractor is what decides what a (pinned, verified) tarball may do to the disk:
// files and directories under the destination, nothing else — pinned here with archives
// built by hand, fed whole and in awkward chunks.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractTar, safeEntryPath } from "./tarExtract";

const BLOCK = 512;

function header(name: string, size: number, type: string, mode = 0o644, prefix = ""): Buffer {
  const b = Buffer.alloc(BLOCK);
  b.write(name, 0, 100, "utf8");
  b.write(`${mode.toString(8).padStart(7, "0")}\0`, 100, 8, "latin1");
  b.write("0000000\0", 108, 8, "latin1");
  b.write("0000000\0", 116, 8, "latin1");
  b.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "latin1");
  b.write("00000000000\0", 136, 12, "latin1");
  b.write("        ", 148, 8, "latin1");
  b.write(type, 156, 1, "latin1");
  b.write("ustar\0", 257, 6, "latin1");
  b.write("00", 263, 2, "latin1");
  if (prefix) b.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += b[i];
  b.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return b;
}

function entry(name: string, content: string | Buffer = "", type = "0", mode = 0o644, prefix = ""): Buffer {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const pad = Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK);
  return Buffer.concat([header(name, body.length, type, mode, prefix), body, pad]);
}

const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]);

async function* chunked(buf: Buffer, size: number) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

let dest = "";
afterEach(() => {
  if (dest) rmSync(dest, { recursive: true, force: true });
});
const fresh = () => (dest = mkdtempSync(join(tmpdir(), "openmasq-tar-")));

describe("extractTar", () => {
  it("writes files and directories under the destination, keeping the executable bit", async () => {
    const archive = tar(entry("bin/", "", "5", 0o755), entry("bin/tool", "#!/bin/sh\n", "0", 0o755), entry("README", "hi"));
    const out = await extractTar(chunked(archive, 1000), fresh());
    expect(out.files).toBe(2);
    expect(readFileSync(join(dest, "bin/tool"), "utf8")).toBe("#!/bin/sh\n");
    expect(readFileSync(join(dest, "README"), "utf8")).toBe("hi");
    if (process.platform !== "win32") expect(statSync(join(dest, "bin/tool")).mode & 0o111).not.toBe(0);
  });

  it("survives chunk boundaries anywhere — one byte at a time included", async () => {
    const big = Buffer.alloc(1500, 7);
    const archive = tar(entry("a/b/c.bin", big), entry("d.txt", "x"));
    await extractTar(chunked(archive, 1), fresh());
    expect(readFileSync(join(dest, "a/b/c.bin")).equals(big)).toBe(true);
    expect(readFileSync(join(dest, "d.txt"), "utf8")).toBe("x");
  });

  it("reads a ustar prefix, a GNU long name and a pax path", async () => {
    const long = `${"deep/".repeat(30)}file.txt`;
    // A pax record is « <len> path=<value>\n » where len counts the whole record.
    const body = " path=pax/dir/pax.txt\n";
    const paxRecord = Buffer.from(`${body.length + String(body.length + 2).length}${body}`);
    const archive = tar(
      entry("leaf.txt", "p", "0", 0o644, "pre/fix"),
      entry("././@LongLink", `${long}\0`, "L"),
      entry(long.slice(0, 99), "L"),
      entry("./PaxHeaders/x", paxRecord, "x"),
      entry("ignored-name", "P"),
    );
    await extractTar(chunked(archive, 777), fresh());
    expect(readFileSync(join(dest, "pre/fix/leaf.txt"), "utf8")).toBe("p");
    expect(readFileSync(join(dest, long), "utf8")).toBe("L");
    expect(readFileSync(join(dest, "pax/dir/pax.txt"), "utf8")).toBe("P");
  });

  it("refuses a symlink, a hardlink, an absolute path and a `..` segment — nothing else runs", async () => {
    for (const bad of [
      entry("link", "", "2"),
      entry("hard", "", "1"),
      entry("/etc/passwd", "x"),
      entry("../escape", "x"),
      entry("ok/../../escape", "x"),
    ]) {
      await expect(extractTar(chunked(tar(bad), 512), fresh())).rejects.toThrow(/tar: refused/);
      expect(existsSync(join(dest, "..", "escape"))).toBe(false);
    }
  });

  it("refuses a truncated archive and a corrupt header", async () => {
    const whole = tar(entry("f", "content"));
    await expect(extractTar(chunked(whole.subarray(0, 600), 100), fresh())).rejects.toThrow(/truncated/);
    const corrupt = Buffer.from(whole);
    corrupt[10] ^= 0xff;
    await expect(extractTar(chunked(corrupt, 512), fresh())).rejects.toThrow(/checksum/);
  });

  it("caps the total size", async () => {
    const archive = tar(entry("big", Buffer.alloc(4096, 1)));
    await expect(extractTar(chunked(archive, 512), fresh(), { maxBytes: 1024 })).rejects.toThrow(/too large/);
  });
});

describe("safeEntryPath", () => {
  it("normalises what is safe and throws on what is not", () => {
    expect(safeEntryPath("./bin/codex")).toBe("bin/codex");
    expect(safeEntryPath("bin/")).toBe("bin");
    expect(safeEntryPath("./")).toBe("");
    for (const bad of ["/abs", "C:\\x", "a\\b", "a/../b", "..", "a//b", "a/./b", "a\0b"]) {
      expect(() => safeEntryPath(bad), bad).toThrow();
    }
  });
});
