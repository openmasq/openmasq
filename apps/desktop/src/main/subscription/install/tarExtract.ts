/**
 * A streaming tar extractor for the ONE archive this process ever unpacks: a pinned,
 * sha256-verified release tarball (`pins.ts`). Written here rather than pulled from npm
 * because the archive is trusted only AFTER the pin matched, and what a tar can still do
 * to a filesystem is decided by the extractor: so it is fail-closed by construction.
 *
 * - **Regular files and directories only.** A symlink, hardlink, device or FIFO entry
 *   REFUSES the whole extraction (a link out of the tree followed by a file written
 *   through it is the classic escape). Allow-list, not denylist (root rule 7).
 * - **Every path is relative and stays under `destDir`**: no absolute path, no drive
 *   letter, no backslash, no `..` segment — and the resolved target is re-checked.
 * - **Bounded**: total bytes and entry count are capped; a truncated archive throws.
 *
 * Formats: ustar (with `prefix`), GNU long names (`L`), pax `path=` (`x`). That is what
 * GitHub-built release tarballs use (measured on codex-package 0.149.1).
 */
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const BLOCK = 512;
const MAX_META = 64 * 1024;

export interface ExtractOptions {
  maxBytes?: number;
  maxEntries?: number;
}

interface Header {
  name: string;
  size: number;
  type: string;
  mode: number;
}

const cstr = (b: Buffer, off: number, len: number): string => {
  const s = b.subarray(off, off + len);
  const nul = s.indexOf(0);
  return s.subarray(0, nul < 0 ? len : nul).toString("utf8");
};

function octal(b: Buffer, off: number, len: number): number {
  if (b[off] & 0x80) throw new Error("tar: base-256 numeric field not supported");
  const s = cstr(b, off, len).trim();
  if (s === "") return 0;
  if (!/^[0-7]+$/.test(s)) throw new Error("tar: corrupt numeric field");
  return Number.parseInt(s, 8);
}

function isZero(b: Buffer): boolean {
  for (let i = 0; i < BLOCK; i++) if (b[i] !== 0) return false;
  return true;
}

function parseHeader(b: Buffer): Header {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : b[i];
  if (sum !== octal(b, 148, 8)) throw new Error("tar: header checksum mismatch");
  const ustar = b.toString("latin1", 257, 262) === "ustar";
  const prefix = ustar ? cstr(b, 345, 155) : "";
  const base = cstr(b, 0, 100);
  return {
    name: prefix ? `${prefix}/${base}` : base,
    size: octal(b, 124, 12),
    type: b[156] === 0 ? "0" : String.fromCharCode(b[156]),
    mode: octal(b, 100, 8),
  };
}

/** The entry's path as a safe RELATIVE path, or a throw. Pure — pinned by the test. */
export function safeEntryPath(name: string): string {
  let n = name;
  while (n.startsWith("./")) n = n.slice(2);
  n = n.replace(/\/+$/, "");
  if (n === "" || n === ".") return "";
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n) || n.includes("\\") || n.includes("\0")) {
    throw new Error("tar: refused entry path");
  }
  const parts = n.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) throw new Error("tar: refused entry path");
  return parts.join("/");
}

function parsePax(b: Buffer): { path?: string } {
  const out: { path?: string } = {};
  let i = 0;
  while (i < b.length) {
    const sp = b.indexOf(32, i);
    if (sp < 0) break;
    const len = Number.parseInt(b.toString("latin1", i, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = b.toString("utf8", sp + 1, i + len - 1);
    const eq = rec.indexOf("=");
    if (eq > 0 && rec.slice(0, eq) === "path") out.path = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Extract `input` (an already-gunzipped tar stream) under `destDir`. Resolves with the
 *  number of regular files written; rejects — leaving whatever was written — on anything
 *  the header comment refuses. The caller owns `destDir` and removes it on failure. */
export async function extractTar(
  input: AsyncIterable<Uint8Array>,
  destDir: string,
  opts: ExtractOptions = {},
): Promise<{ files: number }> {
  const maxBytes = opts.maxBytes ?? 1_500_000_000;
  const maxEntries = opts.maxEntries ?? 10_000;
  const dest = resolve(destDir);
  mkdirSync(dest, { recursive: true });
  const target = (rel: string): string => {
    const abs = resolve(dest, rel);
    if (abs !== dest && !abs.startsWith(dest + sep)) throw new Error("tar: refused entry path");
    return abs;
  };

  let buf = Buffer.alloc(0);
  let inBody = false;
  let remaining = 0;
  let pad = 0;
  let sink: "file" | "longname" | "pax" | "skip" = "skip";
  let fd: number | null = null;
  let meta: Buffer[] = [];
  let metaLen = 0;
  let nextName: string | null = null;
  let zeros = 0;
  let files = 0;
  let total = 0;
  let entries = 0;

  const closeFd = () => {
    if (fd !== null) closeSync(fd);
    fd = null;
  };

  try {
    for await (const chunk of input) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      for (;;) {
        if (!inBody) {
          if (buf.length < BLOCK) break;
          const block = buf.subarray(0, BLOCK);
          buf = buf.subarray(BLOCK);
          if (isZero(block)) {
            if (++zeros >= 2) return { files };
            continue;
          }
          zeros = 0;
          if (++entries > maxEntries) throw new Error("tar: too many entries");
          const h = parseHeader(block);
          const name = nextName ?? h.name;
          nextName = null;
          remaining = h.size;
          pad = (BLOCK - (h.size % BLOCK)) % BLOCK;
          if (h.type === "L") sink = "longname";
          else if (h.type === "x") sink = "pax";
          else if (h.type === "g") sink = "skip";
          else if (h.type === "5") {
            const rel = safeEntryPath(name);
            if (rel) mkdirSync(target(rel), { recursive: true });
            sink = "skip";
          } else if (h.type === "0" || h.type === "7") {
            const rel = safeEntryPath(name);
            if (!rel) throw new Error("tar: file without a name");
            const abs = target(rel);
            mkdirSync(dirname(abs), { recursive: true });
            fd = openSync(abs, "w", (h.mode & 0o777) || 0o644);
            sink = "file";
          } else throw new Error(`tar: refused entry type '${h.type}'`);
          inBody = true;
          continue;
        }
        if (remaining > 0) {
          if (buf.length === 0) break;
          const take = Math.min(remaining, buf.length);
          const piece = buf.subarray(0, take);
          buf = buf.subarray(take);
          remaining -= take;
          if (sink === "file") {
            total += take;
            if (total > maxBytes) throw new Error("tar: archive too large");
            writeSync(fd as number, piece);
          } else if (sink !== "skip") {
            metaLen += take;
            if (metaLen > MAX_META) throw new Error("tar: metadata entry too large");
            meta.push(Buffer.from(piece));
          }
          if (remaining > 0) continue;
        }
        if (buf.length < pad) break;
        buf = buf.subarray(pad);
        if (sink === "file") {
          closeFd();
          files++;
        } else if (sink === "longname") nextName = cstr(Buffer.concat(meta), 0, metaLen);
        else if (sink === "pax") nextName = parsePax(Buffer.concat(meta)).path ?? null;
        meta = [];
        metaLen = 0;
        inBody = false;
      }
    }
    throw new Error("tar: truncated archive");
  } finally {
    closeFd();
  }
}
