// The MODEL-facing surface of the filesystem worker: the handlers behind the MCP tools
// declared in `tools.ts`. Text in, text out — a tool result is a string a model reads.
// Every path goes through `grant.resolve` FIRST; all ops are bounded (no OOM / no
// event-loop block). Kept in its own map so a model-supplied tool name can NEVER reach
// the UI-only ops in `uiOps.ts` (see `protocol.ts`). Everything decidable from the
// arguments alone lives in `fileEdit.ts`, pure and unit-tested.
import { createReadStream } from "node:fs";
import { copyFile, open, readFile, writeFile, mkdir, rename, rm, stat, readdir, chmod, unlink } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { applyEdit, revisionOf, takeLines } from "./fileEdit";
import { DOCX_OPS } from "./docxOps";
import { readVerdict } from "./binaryGuard";
import { FIND_TRUNCATED_MARKER } from "./protocol";
import type { Grant } from "./grant"; import { BRAND } from "@openmasq/branding";

const MAX_READ = 2_000_000; // cap read_file (bytes) — bound memory
const MAX_WRITE = 20_000_000; // cap write_file (bytes)
const MAX_RESULTS = 500; // cap search / tree entries
const MAX_DEPTH = 24; // cap recursion depth
const MAX_LINES = 2_000; // cap one paged read (lines)

const str = (a: Record<string, unknown>, k: string): string => {
  const v = a[k];
  if (typeof v !== "string") throw new Error(`argument \`${k}\` requis (chaîne)`);
  return v;
};
const optStr = (a: Record<string, unknown>, k: string): string | undefined =>
  typeof a[k] === "string" && a[k] ? (a[k] as string) : undefined;
const optNum = (a: Record<string, unknown>, k: string): number | undefined =>
  typeof a[k] === "number" && Number.isFinite(a[k] as number) ? (a[k] as number) : undefined;

export type ToolOp = (g: Grant, a: Record<string, unknown>) => Promise<string>;

/**
 * The ONE bounded recursive walk, shared by `search_files` and `find_files` — the two
 * rules that make it safe must exist once, not once per caller: **symlinks are never
 * followed** (a link out of the grant would escape it) and the traversal is capped by
 * `MAX_RESULTS` + `MAX_DEPTH` so a deep or huge tree can neither hang nor OOM.
 * An unreadable directory is skipped, not fatal.
 */
async function walkTree(
  root: string,
  keep: (name: string) => boolean,
  cap = MAX_RESULTS,
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  let hitCap = false;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || paths.length >= cap) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip
    }
    for (const e of entries) {
      if (paths.length >= cap) {
        hitCap = true;
        return;
      }
      if (e.isSymbolicLink()) continue; // never follow links during traversal
      const full = join(dir, e.name);
      if (keep(e.name)) paths.push(full);
      if (e.isDirectory()) await walk(full, depth + 1);
    }
  };
  await walk(root, 0);
  return { paths, truncated: hitCap || paths.length >= cap };
}

/** The first bytes of a file — enough to tell text from binary without reading it all. */
async function headBytes(path: string): Promise<Uint8Array> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Lines of a file, streamed. Each line keeps a trailing `\r` when the file is CRLF, so
 *  `join("\n")` reconstructs the ORIGINAL bytes — a paged read that silently normalised
 *  line endings would hand the model text whose `oldText` can never match on `edit_file`. */
async function* lineStream(path: string): AsyncGenerator<string> {
  let carry = "";
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    const parts = (carry + (chunk as string)).split("\n");
    carry = parts.pop() ?? "";
    for (const part of parts) yield part;
  }
  if (carry) yield carry;
}

/**
 * Write through a temporary file in the SAME directory, then `rename` over the target.
 *
 * `rename` within one filesystem is atomic, so a reader — or a crash, or a full disk —
 * sees either the old file or the new one, never the truncated middle. A direct
 * `writeFile` truncates first and fills after: interrupt it and the user's file is
 * destroyed with no copy anywhere. The temp file is derived from the already-resolved
 * target so it stays inside the granted directory, and it is removed on any failure.
 */
export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  mode?: number,
): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.${BRAND.slug}-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(tmp, content, typeof content === "string" ? { encoding: "utf8", flag: "wx" } : { flag: "wx" });
    if (mode !== undefined) await chmod(tmp, mode);
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/** `stat` of an existing FILE, or null. A missing file is a legitimate "creating it" case
 *  on the write path, never an error here. */
async function statFile(path: string): Promise<{ mtimeMs: number; size: number; mode: number } | null> {
  try {
    const st = await stat(path);
    return st.isFile() ? { mtimeMs: st.mtimeMs, size: st.size, mode: st.mode & 0o777 } : null;
  } catch {
    return null;
  }
}

/**
 * Enforce `expectedRevision` before replacing a file's contents.
 *
 * OPT-IN by design: a model that never passes one behaves exactly as before, so this
 * introduces no new refusal. When it does pass one, a mismatch REFUSES rather than
 * overwrites — the file changed between the read and the write (the user editing in their
 * own editor while the model was thinking) and the `content` was composed against text
 * that no longer exists.
 */
function assertRevision(current: { mtimeMs: number; size: number } | null, expected: string | undefined): void {
  if (!expected) return;
  const actual = current ? revisionOf(current) : "(absent)";
  if (actual === expected) return;
  throw new Error(
    `le fichier a changé depuis votre lecture (révision attendue ${expected}, actuelle ${actual}) — ` +
      `relisez-le avant de réécrire, sinon vous écraseriez cette modification`,
  );
}

export const TOOL_OPS: Record<string, ToolOp> = {
  async list_allowed_directories(g) {
    return `Dossiers autorisés :\n${g.roots.join("\n")}`;
  },

  async read_file(g, a) {
    const p = g.resolve(str(a, "path"));
    const st = await stat(p);
    if (!st.isFile()) throw new Error("ce chemin n'est pas un fichier");
    // A PDF read as utf8 returns mojibake, and nothing errors: the model gets tens of
    // thousands of unusable characters, after seconds of local NER spent redacting
    // them. Refuse, and NAME the tool that works (`binaryGuard.ts`).
    const verdict = readVerdict(p, await headBytes(p));
    if (verdict.kind !== "text") throw new Error(verdict.message);
    const revision = revisionOf(st);
    const offset = optNum(a, "offset");
    const limit = optNum(a, "limit");

    // Whole-file read: unchanged, still refused above the cap — but the refusal now names
    // the way out instead of being a dead end.
    if (offset === undefined && limit === undefined) {
      if (st.size > MAX_READ)
        throw new Error(
          `fichier trop volumineux (> ${MAX_READ} octets) — relisez-le par tranches avec \`offset\` et \`limit\``,
        );
      return `[révision ${revision}]\n${await readFile(p, "utf8")}`;
    }

    // Paged read: memory is bounded by the SLICE, so any file size stays reachable.
    const slice = await takeLines(lineStream(p), offset ?? 1, Math.min(limit ?? MAX_LINES, MAX_LINES), MAX_READ);
    if (!slice.from) return `[révision ${revision}] (aucune ligne à partir de ${offset ?? 1})`;
    // Saying where the slice STOPS is not cosmetic: a truncation the model can't see reads
    // to it as the whole file, and it answers about a document it only partly received.
    const more = slice.reachedEnd
      ? "fin du fichier"
      : `suite à partir de la ligne ${slice.to + 1}${slice.cappedByBytes ? " (tranche plafonnée en octets)" : ""}`;
    return `[révision ${revision} · lignes ${slice.from}-${slice.to} · ${more}]\n${slice.text}`;
  },

  async write_file(g, a) {
    const p = g.resolve(str(a, "path"));
    const content = str(a, "content");
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE) throw new Error("contenu trop volumineux");
    const before = await statFile(p);
    assertRevision(before, optStr(a, "expectedRevision"));
    await atomicWrite(p, content, before?.mode);
    return `Écrit ${content.length} caractères dans ${p} (révision ${revisionOf(await stat(p))})`;
  },

  async edit_file(g, a) {
    const p = g.resolve(str(a, "path"));
    const st = await stat(p);
    if (!st.isFile()) throw new Error("ce chemin n'est pas un fichier");
    if (st.size > MAX_READ) throw new Error(`fichier trop volumineux pour être édité (> ${MAX_READ} octets)`);
    assertRevision(st, optStr(a, "expectedRevision"));

    const before = await readFile(p, "utf8");
    // `applyEdit` throws on EVERY ambiguity (absent, multiple, empty, no-op): the file is
    // not touched unless exactly one interpretation of the edit exists.
    const { content, occurrences } = applyEdit(before, str(a, "oldText"), str(a, "newText"), a.replaceAll === true);
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE) throw new Error("résultat trop volumineux");
    await atomicWrite(p, content, st.mode & 0o777);

    const delta = content.length - before.length;
    return (
      `Modifié ${p} — ${occurrences} remplacement(s), ${delta >= 0 ? "+" : ""}${delta} caractères ` +
      `(révision ${revisionOf(await stat(p))})`
    );
  },

  async create_directory(g, a) {
    const p = g.resolve(str(a, "path"));
    await mkdir(p, { recursive: true });
    return `Dossier créé : ${p}`;
  },

  async list_directory(g, a) {
    const p = g.resolve(str(a, "path"));
    const entries = await readdir(p, { withFileTypes: true });
    if (entries.length === 0) return "(dossier vide)";
    return entries
      .map((e) => `${e.isDirectory() ? "[DIR] " : e.isSymbolicLink() ? "[LINK]" : "[FILE]"} ${e.name}`)
      .join("\n");
  },

  async move_file(g, a) {
    const source = g.resolve(str(a, "source"));
    const destination = g.resolve(str(a, "destination"));
    try {
      await rename(source, destination);
    } catch (e) {
      // `rename` cannot cross filesystems (EXDEV) — an external disk, a network mount.
      // Fall back for FILES only: copy, then unlink. A directory is refused rather than
      // handled with a recursive copy+remove, which would put a recursive DELETE in this
      // worker; the model has no delete primitive and must keep none (`surfaces.test.ts`).
      if ((e as NodeJS.ErrnoException)?.code !== "EXDEV") throw e;
      const st = await stat(source);
      if (!st.isFile()) throw new Error("déplacement entre volumes non pris en charge pour un dossier");
      await copyFile(source, destination);
      await unlink(source);
    }
    return `Déplacé ${source} → ${destination}`;
  },

  async get_file_info(g, a) {
    const p = g.resolve(str(a, "path"));
    const st = await stat(p);
    return [
      `type: ${st.isDirectory() ? "dossier" : st.isFile() ? "fichier" : "autre"}`,
      `taille: ${st.size} octets`,
      `modifié: ${st.mtime.toISOString()}`,
      `créé: ${st.birthtime.toISOString()}`,
      `permissions: ${(st.mode & 0o777).toString(8)}`,
      ...(st.isFile() ? [`révision: ${revisionOf(st)}`] : []),
    ].join("\n");
  },

  async search_files(g, a) {
    const needle = str(a, "pattern").toLowerCase();
    const out = await walkTree(g.resolve(str(a, "path")), (name) =>
      name.toLowerCase().includes(needle),
    );
    if (out.paths.length === 0) return "(aucun résultat)";
    return out.paths.join("\n") + (out.truncated ? `\n… (tronqué à ${MAX_RESULTS})` : "");
  },

  /** The CANDIDATES for a semantic search — the walk only. Ranking needs the on-device
   *  embedder, which lives in MAIN (`./findFiles.ts`); a plain-Node worker can't reach
   *  it, so `connection.ts` post-processes this list exactly like it pre-empts
   *  `read_document`. Every entry is kept: filtering here would decide relevance with
   *  the one tool that has no idea what the user meant. */
  async find_files(g, a) {
    const root = optStr(a, "path");
    const roots = root ? [g.resolve(root)] : g.roots;
    const paths: string[] = [];
    let truncated = false;
    for (const r of roots) {
      const out = await walkTree(r, () => true, MAX_RESULTS - paths.length);
      paths.push(...out.paths);
      truncated = truncated || out.truncated;
      if (paths.length >= MAX_RESULTS) break;
    }
    return paths.join("\n") + (truncated ? `\n${FIND_TRUNCATED_MARKER}` : "");
  },

  /** Word — the body is patched surgically and every other part of the package is copied
   *  through untouched (`docxOps.ts`). Writes ride the same atomic rename as the rest. */
  read_document: (g, a) => DOCX_OPS.read_document(g, a, atomicWrite),
  edit_document: (g, a) => DOCX_OPS.edit_document(g, a, atomicWrite),
};
