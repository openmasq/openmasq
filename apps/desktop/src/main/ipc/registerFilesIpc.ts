import { shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "path";
import { redactFileInPlace } from "@openmasq/redact/inplace";
import {
  dbSaveFile,
  dbListFiles,
  dbLoadFile,
  dbDeleteFile,
  dbConversationsForFile,
  type DbFile,
} from "../db";
import { pickAndExtract, extractPaths, pickPaths, type OcrProgressFn } from "../files";
import { safeFileName } from "../db/safePath";
import { safeFetch } from "../net/net";
import { isFetchHostAllowed } from "../net/fetchAllow";
import { previewLink } from "../net/linkPreview";
import { withAgentBrowserHidden } from "../mcp/browser";
import { grantRead, assertReadAllowed } from "./readGate";
import { registerExtractIpc } from "./filesExtractIpc";
import { makeDocumentScrub } from "./documentScrub";
import { handle, str, bool, obj, } from "./handle";
import { BRAND } from "@openmasq/branding";

// Minimal ext⇄mime maps for downloaded exports (a signed URL rarely has a real
// filename; content-type is the fallback). Unknown → octet-stream / no ext.
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  zip: "application/zip",
};
const extToMime = (ext: string): string => EXT_MIME[ext] ?? "application/octet-stream";
const mimeToExt = (mime: string): string =>
  Object.keys(EXT_MIME).find((e) => EXT_MIME[e] === mime) ?? "";

// OpenGraph link-unfurl opt-in, authoritative in MAIN (audit M4). DEFAULT OFF — a
// preview requested while off is refused even if the renderer asks (fail closed).
let linkPreviewsEnabled = false;

/**
 * Register the file / link IPC — the renderer's local-file and remote-fetch trust
 * boundary, kept in ONE module so the read-gate (audit H-1) and the fetch/preview
 * host allow-list (audit M4) live next to the handlers they protect. The read-grant
 * Set is module-level so a `files:pick` grant and the later `files:read` check share
 * the SAME state (moved verbatim out of index.ts's `registerChatHandlers`). Fail-closed
 * throughout: an ungranted path, an unobserved fetch host, and a not-opted-in preview
 * are each refused, never silently allowed.
 */
// OCR progress → renderer: the payload carries the NAME (attribution of concurrent
// extractions); best-effort. Exported: `filesExtractIpc.ts` relays the same progress.
export const progressTo =
  (sender: Electron.WebContents): OcrProgressFn =>
  (name, page, pages) => {
    try {
      if (!sender.isDestroyed()) sender.send("files:ocr-progress", { name, page, pages });
    } catch {
      /* display only */
    }
  };

export function registerFilesIpc(): void {
  // File attachments: extract plain text so the renderer can redact it before
  // anything is sent to a model (the raw file never leaves the machine).
  // E2E hook: the native file picker can't be automated, so a test can point
  // this at real fixture file(s) (":"-separated) — they're extracted by the same
  // @openmasq/redact/documents path as a user-chosen file. Inert without the var.
  handle("files:pick", [], (e) => {
    const attach = process.env.OPENMASQ_E2E_ATTACH;
    if (attach) {
      const paths = attach.split(":");
      paths.forEach(grantRead); // E2E fixture paths → grant (env-set, trusted)
      return extractPaths(paths, progressTo(e.sender));
    }
    // Hide the alwaysOnTop agent browser while the native picker is up (else it covers it).
    return withAgentBrowserHidden(() => pickAndExtract(progressTo(e.sender))).then((files) => {
      // The user just chose these via the native dialog → grant reading them this
      // session (mirrors files:pick-paths), so a later files:read / redact-and-save
      // by path is allowed (audit H-1). Without this, the bundled `pick()` fallback
      // produced attachment paths that the read-gate then rejected.
      files.forEach((f) => f.path && grantRead(f.path));
      return files;
    });
  });
  registerExtractIpc();
  // Dialog-only pick (no extraction) so the renderer can show a chip instantly, then
  // extract async. E2E: reuse the pre-set fixture paths (no dialog in headless).
  handle("files:pick-paths", [], async () => {
    const attach = process.env.OPENMASQ_E2E_ATTACH;
    const picked = attach
      ? attach.split(":").map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p }))
      : await withAgentBrowserHidden(() => pickPaths()); // hide agent browser over the picker
    // The user (or the E2E fixture env) just chose these → grant reading them this
    // session, so the follow-up files:extract / files:read is allowed (audit H-1).
    picked.forEach((p) => grantRead(p.path));
    return picked;
  });
  // Read a file's raw bytes for an in-app preview (e.g. rendering a not-yet-stored
  // composer PDF). CONFINED (audit H-1): only a path the user granted this session
  // (picked above) or one inside our own userData / OS temp dir — never an arbitrary
  // absolute path, so a renderer XSS can't read keys.enc / the vault DB / ~/.ssh.
  handle("files:read", [str], async (_e, path) => {
    assertReadAllowed(path);
    return new Uint8Array(await readFile(path));
  });

  // Download a remote file (e.g. a tool-returned export URL) to a temp path. Runs
  // in main (no renderer CSP; keeps the signed URL off the model's path). The
  // renderer then redacts + stores + displays the bytes via files:redact-and-save.
  handle("files:fetch-url", [str], async (_e, url) => {
    // SECURITY (audit M4): only fetch a host we've OBSERVED in relayed content (a tool
    // result / message / model reply). A renderer XSS can't turn this into an exfil GET to
    // an arbitrary `attacker.com/?d=<secret>` — that host was never observed → refuse.
    if (!isFetchHostAllowed(url)) {
      throw new Error("URL non autorisée");
    }
    // Hardened download: SSRF-safe (private hosts blocked at EVERY redirect hop),
    // Content-Type validated (media only), body size-capped while streaming, http(s)
    // only, 20 s timeout — all inside `safeFetch`. The signed URL never touches the
    // renderer / model path; the renderer redacts + stores + displays the bytes.
    const { finalUrl, buf, contentType } = await safeFetch(url, {
      source: "fetch-url",
      accept: "media",
      maxBytes: 30 * 1024 * 1024,
      timeoutMs: 20_000,
    });
    // Name/ext from the FINAL url (after redirects), else the Content-Type.
    const base = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() ?? "");
    const dot = base.lastIndexOf(".");
    const rawExt = dot > 0 ? base.slice(dot + 1).toLowerCase() : mimeToExt(contentType);
    // Clamp to a plain alnum extension — it is spliced into the generated temp path
    // below, so a URL-derived `..%2f`-style tail must never reach the filename.
    const ext = /^[a-z0-9]{1,16}$/.test(rawExt) ? rawExt : "";
    const name = base && dot > 0 ? base : `export.${ext || "bin"}`;
    const mime = contentType || extToMime(ext);

    const path = join(tmpdir(), `${BRAND.slug}-export-${randomUUID()}${ext ? `.${ext}` : ""}`);
    await writeFile(path, buf);
    return { path, name, mime };
  });

  // OpenGraph link-unfurl. The EXFIL boundary is the host allow-list below (main-side,
  // audit M4). The `linkPreviews` opt-in is ALSO enforced in main (not only renderer):
  // main tracks the authoritative flag, DEFAULT OFF (fail closed — no unfurl leaks the
  // user's IP to a site before they opt in). The renderer pushes its setting via
  // `links:set-enabled`; a preview requested while OFF is refused even if the renderer
  // asks for it. Runs in main so the fetch (page + og:image) goes through `safeFetch`
  // (SSRF-safe, per-hop private-host block, Content-Type + size caps) and the image comes
  // back as a `data:` URL — the renderer never hits the remote host (CSP blocks it).
  handle("links:set-enabled", [bool], (_e, on) => {
    linkPreviewsEnabled = on;
  });
  handle("links:preview", [str], (_e, url) => {
    // Opt-in enforced in main (audit M4): fail closed when the user hasn't enabled previews.
    if (!linkPreviewsEnabled) throw new Error("Aperçus de liens désactivés");
    // SECURITY (audit M4): same host allow-list as files:fetch-url — a preview must only
    // ever unfurl a link main saw in a message/reply, never an XSS-crafted exfil URL.
    if (!isFetchHostAllowed(url)) throw new Error("URL non autorisée");
    return previewLink(url);
  });

  // Local file store (`files` table): keep BOTH the user's original bytes and the
  // redacted version. Same table for both modes:
  //  - visible mode: the in-page injector already redacted in place → files:save.
  //  - hidden mode: the renderer has only the path → files:redact-and-save reads
  //    it, redacts in place with the conversation vault, stores both, and returns
  //    the merged vault.
  handle("files:save", [obj], (_e, f) => dbSaveFile(f as unknown as DbFile));
  handle("files:list", [str], (_e, conversationId) => dbListFiles(conversationId));
  handle("files:load", [str], (_e, id) => dbLoadFile(id));
  handle("files:delete", [str], (_e, id) => dbDeleteFile(id));
  // Conversations that have attached the same file (by content hash) — powers the
  // library's "used in N conversations" + re-attach.
  handle("files:conversations", [str], (_e, hash) =>
    dbConversationsForFile(hash).then((rows) => rows.map((r) => r.conversationId)),
  );
  // Open a stored file for viewing in the OS default app. The renderer is
  // sandboxed (CSP `default-src 'self'` blocks `blob:` downloads), so we go
  // through main: load the ORIGINAL bytes, drop them in a temp file that keeps
  // the real name/extension, and hand it to `shell.openPath`.
  handle("files:open", [str], async (_e, id) => {
    const data = await dbLoadFile(id);
    if (!data) return false;
    // Generated temp file: a RANDOM basename (never the renderer-supplied id) plus the
    // file's SANITISED display name, so a hostile id/name can't traverse out of tmpdir
    // (audit: files-store path traversal). The real extension survives for the OS
    // handler; the slug prefix keeps it inside the read-gate's temp allow-list.
    const path = join(tmpdir(), `${BRAND.slug}-${randomUUID()}-${safeFileName(data.name)}`);
    await writeFile(path, Buffer.from(data.original));
    const err = await shell.openPath(path);
    return err === "";
  });
  /** The payload of `files:redact-and-save`. A shape the handler ITSELF still re-checks
   *  (`typeof p.data === "string"`, the `p.path` branch): `obj` at the boundary only
   *  guarantees it is a plain object, never that a field holds what it claims. */
  type RedactAndSave = {
    id: string;
    conversationId: string;
    path?: string;
    data?: string;
    name: string;
    mime: string;
    vault: Record<string, string>;
    disabledKinds?: string[];
    /** Renderer's drop-time distinct-redaction count — the fallback stored count for
     *  a blocked format (image/PDF) whose in-place pass finds nothing. Untrusted +
     *  display-only, so it is clamped below; it never gates a redaction decision. */
    redactedCount?: number;
    /** The file's already-computed extraction (text + OCR) — persisted so a later
     *  RE-ATTACH reuses it instead of re-running OCR. RAW real PII: it only ever lands
     *  in the encrypted DB column here, and is re-redacted by each send that uses it. */
    extraction?: {
      text: string;
      ocrText?: string;
      words?: unknown;
      ocr?: unknown;
      /** The file's redaction map — persisted as-is (encrypted JSON). */
      redactions?: unknown;
    };
  };
  handle("files:redact-and-save", [obj], async (_e, raw) => {
    const p = raw as RedactAndSave;
    // Original bytes come from EITHER inline base64 `data` (RE-ATTACH: the renderer
    // already holds the DECRYPTED original from db.loadFile — the on-disk blob is
    // encrypted at rest, so re-reading its path would yield ciphertext AND is denied
    // by the gate since it lives under the secret userData/files dir) OR a granted
    // on-disk `path` (native pick). The path branch keeps the same read-gate as
    // files:read/open — a compromised renderer must not exfiltrate an arbitrary file
    // (it comes back as `original` bytes in the saved record). `data` grants no new
    // read capability: the renderer only hands back bytes it already possesses.
    let original: Uint8Array;
    if (typeof p.data === "string") {
      original = new Uint8Array(Buffer.from(p.data, "base64"));
    } else {
      if (!p.path) throw new Error("Accès fichier refusé : chemin ou données manquants.");
      assertReadAllowed(p.path);
      original = new Uint8Array(await readFile(p.path));
    }
    const vault = { ...p.vault };
    // The classifier lives in `./documentScrub` — it is the half that must agree with the
    // renderer's message pass on ONE map (`redactionKinds`), and it disagreed for a long
    // time. Extracted so a test can CALL it rather than read this file: the agreement is
    // pinned value-for-value by `documentKinds.parity.test.ts`, not by this comment.
    const { scrub, kinds, spans } = makeDocumentScrub(vault, p.disabledKinds);
    let scrubbed: Uint8Array | null = null;
    let redacted = false;
    try {
      scrubbed = redactFileInPlace(p.name, original, p.mime, scrub).bytes;
      redacted = true;
    } catch {
      /* blocked format (pdf/image/unknown) → keep the original only */
    }
    await dbSaveFile({
      id: p.id,
      conversationId: p.conversationId,
      name: p.name,
      mime: p.mime,
      redacted,
      original,
      scrubbed,
      // When we scrubbed the bytes in place, `spans` (already deduped by value) IS the
      // distinct masked-item count. For a BLOCKED format (image/PDF) the in-place pass
      // threw and `spans` is empty, but the file's OCR/text WAS redacted in the wire —
      // so fall back to the renderer's drop-time count (clamped; untrusted, display-only).
      redactedCount: redacted
        ? spans.length
        : Math.max(0, Math.floor(Number(p.redactedCount) || 0)),
      // Persist the extraction so a re-attach reuses it (skips re-OCR); the reuse path
      // re-redacted it with the new conversation's vault, so storing the RAW text here
      // is safe — it never leaves this encrypted DB.
      extraction: p.extraction,
    });
    // `redacted` = were the BYTES rewritten (see the host type: for a PDF the in-place
    // pass throws by design, so an empty `spans` is NOT « rien de redacted »).
    return { vault, kinds, spans, redacted }; // merged into the conversation + log
  });
}
