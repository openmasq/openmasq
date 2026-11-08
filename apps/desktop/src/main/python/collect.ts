import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * The run's OUTPUTS, read back by MAIN — which is UNJAILED. Whatever the child left in its
 * scratch is untrusted: a symlink there would be FOLLOWED by main and a file the jail denies
 * (the accounts, `mcp.json`, a key) handed back as a "deliverable". Three layers:
 *  - the DIRECTORY read (`out/`, `figures/`) must be a real directory, not a link, and the
 *    SAME directory (device + inode) from before the listing to after the last read — the
 *    child can rename it and put a link in its place;
 *  - each FILE is opened with `O_NOFOLLOW` and checked on the open descriptor (regular, one
 *    link, within its size cap), then read from that descriptor;
 *  - `sandbox.ts` kills the child's whole process group BEFORE collecting, so nothing it
 *    forked is still around to swap a path mid-read.
 * Residual (macOS): a descendant that left the process group (`setsid`) survives the kill; it
 * would have to swap the directory and swap it back between two checks of one collection.
 * Linux's bwrap PID namespace (`--die-with-parent`) leaves no such survivor.
 * Pinned in `collect.test.ts`.
 */

const MAX_IMAGES = 8;
const MAX_IMG_BYTES = 6 * 1024 * 1024;
export const MAX_FILES = 8;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // a generated PDF/xlsx can be a few MB

/** Extensions the code runner is allowed to hand back as a DELIVERABLE file (a report
 *  the model generated). Curated so junk/temp binaries aren't surfaced; images go
 *  through the figure path instead. */
export const OUTPUT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".zip": "application/zip",
};

export const extOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
};

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** `O_NOFOLLOW` where the platform has it (POSIX); 0 on Windows, whose jail cannot create links. */
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;

/** The directory's identity, or null when it is not a REAL directory (a link, a file, gone). */
async function dirIdentity(dir: string): Promise<string | null> {
  try {
    const st = await lstat(dir);
    return st.isDirectory() && !st.isSymbolicLink() ? `${st.dev}:${st.ino}` : null;
  } catch {
    return null;
  }
}

/** One collected file's bytes, or null: a link, a non-regular file, a hardlink (it aliases
 *  another path), a separator in the name, or over `maxBytes`. */
async function readCollected(dir: string, name: string, maxBytes: number): Promise<Buffer | null> {
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  let fh;
  try {
    fh = await open(join(dir, name), constants.O_RDONLY | NOFOLLOW | NONBLOCK);
    const st = await fh.stat();
    if (!st.isFile() || st.size > maxBytes || st.nlink > 1) return null;
    return await fh.readFile();
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/** Read `names` (as `pick` filters them) out of `dir`, all or nothing: if `dir` is not the
 *  same real directory after the last read as before the listing, NOTHING is returned. */
async function collectFrom(
  dir: string,
  pick: (names: string[]) => string[],
  maxBytes: number,
): Promise<{ name: string; bytes: Buffer }[]> {
  const before = await dirIdentity(dir);
  if (!before) return [];
  const names = pick(await readdir(dir).catch(() => []));
  const out: { name: string; bytes: Buffer }[] = [];
  for (const name of names) {
    const bytes = await readCollected(dir, name, maxBytes);
    if (bytes) out.push({ name, bytes });
  }
  return (await dirIdentity(dir)) === before ? out : [];
}

/** Collect saved figures (`fig_*.png`) as base64, bounded in count and size. */
export async function collectImages(figDir: string): Promise<{ name: string; base64: string }[]> {
  const pick = (names: string[]) => names.filter((n) => n.toLowerCase().endsWith(".png")).sort().slice(0, MAX_IMAGES);
  return (await collectFrom(figDir, pick, MAX_IMG_BYTES)).map(({ name, bytes }) => ({ name, base64: bytes.toString("base64") }));
}

/** Collect DELIVERABLE files the code wrote to the (clean, dedicated) output dir —
 *  only curated document extensions, bounded in count + size. A SEEDED file whose
 *  bytes are UNCHANGED is skipped (it was already delivered in a previous turn);
 *  a modified one comes back as a fresh deliverable. */
export async function collectFiles(
  outDir: string,
  seeded: Map<string, string> = new Map(),
): Promise<{ name: string; base64: string; mime: string }[]> {
  const pick = (names: string[]) => names.filter((n) => OUTPUT_MIME[extOf(n)]).sort();
  const out: { name: string; base64: string; mime: string }[] = [];
  for (const { name, bytes } of await collectFrom(outDir, pick, MAX_FILE_BYTES)) {
    if (out.length >= MAX_FILES) break;
    if (seeded.get(name) === sha256(bytes)) continue; // unchanged seed → not a new deliverable
    out.push({ name, base64: bytes.toString("base64"), mime: OUTPUT_MIME[extOf(name)] });
  }
  return out;
}
