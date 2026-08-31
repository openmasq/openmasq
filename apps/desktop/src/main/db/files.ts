import { join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getClient } from "./connection";
import { filesDir } from "./paths";
import { assertSafeFileId, safeExt, assertUnderDir, isUnderDir } from "./safePath";
import { encryptBytes, decryptBytes } from "../store/dbCrypto";

export interface DbFile {
  id: string;
  conversationId: string;
  name: string;
  mime: string;
  /** True when a redacted version exists (scrubbed). False = original only
   *  (e.g. a blocked format that was kept locally but never uploaded). */
  redacted: boolean;
  /** The user's real file bytes. */
  original: Uint8Array;
  /** The redacted bytes sent to the model — null when nothing was redacted. */
  scrubbed?: Uint8Array | null;
  /** Count of DISTINCT masked values in this file (for the library card badge). */
  redactedCount?: number;
  /** The file's extraction (OCR/parse result), stored so a RE-ATTACH skips re-extraction.
   *  Serialized to the encrypted `extraction` JSON column. Raw real PII — never leaves the DB. */
  extraction?: { text: string; ocrText?: string; words?: unknown; ocrPages?: unknown; ocr?: unknown; redactions?: unknown } | null;
  createdAt?: number;
}

/**
 * Store an attached file locally: the BYTES are written to disk under
 * userData/files, only the PATHS go in the DB. Used the same way by the visible
 * (webview) and hidden (relay) modes.
 */
export async function dbSaveFile(f: DbFile): Promise<void> {
  const client = getClient();
  if (!client) return;
  // SECURITY: the renderer-supplied id + name-extension are spliced into the on-disk
  // blob path — validate before ANY fs op so a `../…` id can't escape userData/files
  // (see safePath.ts). `assertUnderDir` is the belt-and-suspenders confinement.
  assertSafeFileId(f.id);
  const dir = filesDir();
  await mkdir(dir, { recursive: true });
  const ext = safeExt(f.name);
  // F2 (data-at-rest): blob bytes are ENCRYPTED with the DB key before hitting disk
  // (no-op in dev / no-keyring, mirroring the DB gate) and written 0600 — so an
  // attached document's real bytes are no longer cleartext in `userData/files`.
  const originalPath = join(dir, `${f.id}-original${ext}`);
  assertUnderDir(originalPath, dir);
  await writeFile(originalPath, encryptBytes(f.original), { mode: 0o600 });
  let scrubbedPath: string | null = null;
  if (f.scrubbed) {
    scrubbedPath = join(dir, `${f.id}-scrubbed${ext}`);
    assertUnderDir(scrubbedPath, dir);
    await writeFile(scrubbedPath, encryptBytes(f.scrubbed), { mode: 0o600 });
  }
  // sha256 of the ORIGINAL (plaintext) bytes — the file's identity across
  // conversations. Computed BEFORE encryption so the hash is stable regardless of
  // the at-rest gating.
  const contentHash = createHash("sha256").update(f.original).digest("hex");
  await client.execute({
    sql: `INSERT INTO files (id, conversation_id, name, mime, redacted, original_path, scrubbed_path, content_hash, redacted_count, extraction, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conversation_id = excluded.conversation_id, name = excluded.name,
            mime = excluded.mime, redacted = excluded.redacted,
            original_path = excluded.original_path, scrubbed_path = excluded.scrubbed_path,
            content_hash = excluded.content_hash, redacted_count = excluded.redacted_count,
            extraction = excluded.extraction`,
    args: [
      f.id,
      f.conversationId,
      f.name,
      f.mime,
      f.redacted ? 1 : 0,
      originalPath,
      scrubbedPath,
      contentHash,
      f.redactedCount ?? 0,
      // The extraction is only stored when it carries actual text — an empty extract adds
      // nothing and would just make the reattach think it can skip a (still-needed) OCR.
      // Text OR redaction map: a scanned image can have almost no
      // text and still carry its map — that's what the viewer repaints.
      f.extraction?.text || (f.extraction?.redactions as unknown[] | undefined)?.length
        ? JSON.stringify(f.extraction)
        : null,
      f.createdAt ?? Date.now(),
    ],
  });
}

/** File metadata + on-disk paths for a conversation (no bytes). */
export async function dbListFiles(conversationId: string): Promise<
  {
    id: string;
    name: string;
    mime: string;
    redacted: boolean;
    originalPath: string;
    scrubbedPath: string | null;
    contentHash: string | null;
    redactedCount: number;
    createdAt: number;
  }[]
> {
  const client = getClient();
  if (!client) return [];
  const res = await client.execute({
    sql: `SELECT id, name, mime, redacted, original_path, scrubbed_path, content_hash, redacted_count, created_at
          FROM files WHERE conversation_id = ? ORDER BY created_at ASC`,
    args: [conversationId],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    mime: String(r.mime),
    redacted: !!Number(r.redacted),
    originalPath: String(r.original_path),
    scrubbedPath: r.scrubbed_path == null ? null : String(r.scrubbed_path),
    contentHash: r.content_hash == null ? null : String(r.content_hash),
    redactedCount: Number(r.redacted_count ?? 0),
    createdAt: Number(r.created_at),
  }));
}

/** Distinct conversation ids that have attached a file with this content hash. */
export async function dbConversationsForFile(
  hash: string,
): Promise<{ conversationId: string }[]> {
  const client = getClient();
  if (!client || !hash) return [];
  const res = await client.execute({
    sql: `SELECT DISTINCT conversation_id FROM files WHERE content_hash = ?`,
    args: [hash],
  });
  return res.rows
    .map((r) => ({ conversationId: String(r.conversation_id) }))
    .filter((r) => r.conversationId && r.conversationId !== "null");
}

/** Load one file's bytes (read from disk via the stored paths) for view/export. */
export async function dbLoadFile(id: string): Promise<{
  name: string;
  mime: string;
  original: Uint8Array;
  scrubbed: Uint8Array | null;
  extraction: { text: string; ocrText?: string; words?: unknown; ocr?: unknown; redactions?: unknown } | null;
} | null> {
  const client = getClient();
  if (!client) return null;
  const res = await client.execute({
    sql: `SELECT name, mime, original_path, scrubbed_path, extraction FROM files WHERE id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  // Stored extraction (JSON) — reused on re-attach to skip re-OCR. Tolerate a corrupt/old
  // value: a parse failure just falls back to re-extraction, never throws.
  let extraction: { text: string; ocrText?: string; words?: unknown; ocr?: unknown } | null = null;
  if (r.extraction != null) {
    try {
      const p = JSON.parse(String(r.extraction));
      if (p && typeof p.text === "string") extraction = p;
    } catch {
      /* corrupt JSON → re-extract on reuse */
    }
  }
  const read = async (p: unknown): Promise<Uint8Array | null> => {
    if (p == null) return null;
    const path = String(p);
    // SECURITY (defence in depth): only ever read a blob INSIDE our files dir. A row
    // written by an older, pre-validation build (or a tampered DB) could hold a
    // traversed absolute path; reading it would leak an arbitrary file. Treat it as
    // absent rather than reading it.
    if (!isUnderDir(path, filesDir())) return null;
    try {
      // F2: decrypt at-rest blobs on the way out (a no-op for legacy plaintext blobs
      // written before this change — see decryptBytes' magic-header passthrough).
      return decryptBytes(new Uint8Array(await readFile(path)));
    } catch {
      return null; // file moved / deleted out from under us
    }
  };
  return {
    name: String(r.name),
    mime: String(r.mime),
    original: (await read(r.original_path)) ?? new Uint8Array(),
    scrubbed: await read(r.scrubbed_path),
    extraction,
  };
}

/** Delete ONE stored file: unlink its blobs from disk, then drop the row. Powers
 *  the library's per-file delete (e.g. removing worthless auto-saved scraped
 *  images). Best-effort on the disk unlink; the row removal is authoritative. */
export async function dbDeleteFile(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const res = await client.execute({
    sql: "SELECT original_path, scrubbed_path FROM files WHERE id = ?",
    args: [id],
  });
  await Promise.all(
    res.rows.flatMap((r) =>
      [r.original_path, r.scrubbed_path]
        .filter((p): p is string => typeof p === "string")
        // SECURITY: never unlink a path outside our files dir — a poisoned/legacy row
        // holding a traversed path would otherwise give arbitrary file deletion.
        .filter((p) => isUnderDir(p, filesDir()))
        .map((p) => rm(p, { force: true }).catch(() => {})),
    ),
  );
  await client.execute({ sql: "DELETE FROM files WHERE id = ?", args: [id] });
}
