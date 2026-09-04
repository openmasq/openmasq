import type { RawSkillFile } from "./claudeSkills";
import { skillsFromPaths, type DroppedFile } from "./skillsFromPaths";

/**
 * What a DROP gives us — the part that touches the DOM. The rule ("what counts as a
 * compétence") is pure and tested separately: `skillsFromPaths.ts`.
 *
 * ⚠️ **A dropped folder gives its BYTES, not its path.** `webkitGetAsEntry` lets the
 * renderer walk the dropped tree and read the files, without granting a
 * path to the privileged process. This is what makes dropping both the shortest
 * gesture and the one that requires no new capability — unlike a read by
 * path, which would widen main's read-gate.
 *
 * Bounds: a hostile drop (or an absent-minded one — `~/Documents`) must neither freeze the app
 * nor starve it. We cap depth, file count and size.
 */
const MAX_DEPTH = 4;
const MAX_FILES = 800;
const MAX_BYTES = 256 * 1024;
const TEXT = /\.(md|markdown|txt)$/i;

/** A directory's entries, all at once (the API returns batches until an empty one). */
function readAll(reader: { readEntries(cb: (e: unknown[]) => void, err: (e: unknown) => void): void }): Promise<unknown[]> {
  return new Promise((resolve) => {
    const acc: unknown[] = [];
    const step = (): void =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(acc);
        acc.push(...batch);
        step();
      }, () => resolve(acc));
    step();
  });
}

/** `FileReader` rather than `Blob.text()`: the latter does not exist everywhere this code
 *  must run (jsdom, hence the tests), and an API that cannot be tested is one whose
 *  breakage is discovered in production — here, a drop that silently returned zero. */
function readText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = () => resolve("");
    fr.readAsText(file);
  });
}

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?(cb: (f: File) => void, err: (e: unknown) => void): void;
  createReader?(): { readEntries(cb: (e: unknown[]) => void, err: (e: unknown) => void): void };
}

async function walk(entry: FsEntry, prefix: string, out: DroppedFile[], depth: number): Promise<void> {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    // Text only: an image or a binary has no place in a prompt, and
    // reading them would cost the whole drop's memory for nothing.
    if (!TEXT.test(entry.name)) {
      out.push({ path, text: "" }); // counts as an EXTRA, without being read
      return;
    }
    const file = await new Promise<File | null>((r) => entry.file!((f) => r(f), () => r(null)));
    if (!file || file.size > MAX_BYTES) return;
    out.push({ path, text: await readText(file) });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    for (const child of await readAll(entry.createReader())) {
      await walk(child as FsEntry, path, out, depth + 1);
    }
  }
}

/**
 * A `.zip` (the archive uploaded to claude.ai has the same shape as a folder).
 *
 * ⚠️ The size bounds are enforced by fflate's `filter`, i.e. BEFORE the entry is
 * inflated — never on the inflated bytes. `unzipSync(bytes)` decompresses every member
 * up front, so checking `data.length` afterwards let a dropped archive allocate
 * gigabytes (a zip bomb, or plainly a 2 GB video someone zipped) and freeze the app
 * before a single cap was consulted. The filter is handed each entry's DECLARED
 * `originalSize` from the central directory, which is exactly what the pre-parse guard
 * on the upload path reads too (`@openmasq/redact` `documents/guard.ts`).
 *
 * The filter also runs for the entries it REFUSES, which is how a non-text member still
 * gets counted as a sibling — it is listed, never read (same rule as the folder walk).
 */
async function fromZip(bytes: Uint8Array): Promise<DroppedFile[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const listed: string[] = [];
  const files = unzipSync(bytes, {
    filter: (f) => {
      listed.push(f.name);
      return TEXT.test(f.name) && f.originalSize <= MAX_BYTES;
    },
  });
  const out: DroppedFile[] = [];
  for (const path of listed) {
    if (out.length >= MAX_FILES || path.endsWith("/")) continue;
    const data = files[path];
    // Absent ⇒ refused by the filter (not text, or over the cap): it counts as an
    // EXTRA without having been read, exactly like a binary in a dropped folder.
    out.push({ path, text: data ? strFromU8(data) : "" });
  }
  return out;
}

const isZip = (b: Uint8Array): boolean => b.length > 1 && b[0] === 0x50 && b[1] === 0x4b;

/** What was dropped → the compétences we can pull from it. */
export async function skillsFromDrop(dt: DataTransfer): Promise<RawSkillFile[]> {
  const files: DroppedFile[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((i) => (i.webkitGetAsEntry?.() ?? null) as FsEntry | null)
    .filter((e): e is FsEntry => !!e);

  if (entries.length) {
    for (const e of entries) await walk(e, "", files, 0);
  }
  // Zips have no tree to walk: they go through the file itself.
  for (const f of Array.from(dt.files ?? [])) {
    if (!/\.zip$/i.test(f.name)) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (isZip(bytes)) files.push(...(await fromZip(bytes)));
  }
  return skillsFromPaths(files);
}
