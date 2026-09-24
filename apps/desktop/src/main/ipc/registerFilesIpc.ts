import { shell } from "electron";
import { readFile } from "node:fs/promises";
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
import { writeAppTmpFile } from "./appTmpFile";
import { safeFetch } from "../net/net";
import { isFetchHostAllowed } from "../net/fetchAllow";
import { previewLink } from "../net/linkPreview";
import { withAgentBrowserHidden } from "../mcp/browser";
import { grantRead, assertReadAllowed } from "./readGate";
import { registerExtractIpc } from "./filesExtractIpc";
import { makeDocumentScrub } from "./documentScrub";
import { handle, str, bool, obj, } from "./handle";
import { devOnly } from "../security/devOnly";

// ext⇄mime for downloaded exports (content-type is the fallback for a signed URL).
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

// Link-unfurl opt-in, authoritative in MAIN. DEFAULT OFF (fail closed).
let linkPreviewsEnabled = false;

// OCR progress → renderer, best-effort; `filesExtractIpc.ts` relays the same.
export const progressTo =
  (sender: Electron.WebContents): OcrProgressFn =>
  (name, page, pages) => {
    try {
      if (!sender.isDestroyed()) sender.send("files:ocr-progress", { name, page, pages });
    } catch {
      /* display only */
    }
  };

/**
 * The renderer's local-file and remote-fetch trust boundary, in ONE module so the read
 * gate and the fetch/preview host allow-list live next to the handlers they protect.
 * Fail-closed throughout: an ungranted path, an unobserved fetch host and a not-opted-in
 * preview are each refused.
 */
export function registerFilesIpc(): void {
  // Extract plain text so the renderer redacts it before anything reaches a model. E2E
  // hook: the native picker can't be automated, so fixture paths (":"-separated) go
  // through the same extraction path.
  handle("files:pick", [], (e) => {
    const attach = devOnly(process.env.OPENMASQ_E2E_ATTACH);
    if (attach) {
      const paths = attach.split(":");
      paths.forEach(grantRead); // E2E fixture paths → grant (env-set, trusted)
      return extractPaths(paths, progressTo(e.sender));
    }
    return withAgentBrowserHidden(() => pickAndExtract(progressTo(e.sender))).then((files) => {
      // The user chose these via the native dialog → grant reading them this session.
      files.forEach((f) => f.path && grantRead(f.path));
      return files;
    });
  });
  registerExtractIpc();
  // Dialog-only pick so the renderer shows a chip instantly, then extracts async.
  handle("files:pick-paths", [], async () => {
    const attach = devOnly(process.env.OPENMASQ_E2E_ATTACH);
    const picked = attach
      ? attach.split(":").map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p }))
      : await withAgentBrowserHidden(() => pickPaths());
    picked.forEach((p) => grantRead(p.path));
    return picked;
  });
  // Raw bytes for an in-app preview. CONFINED: only a path the user granted this session
  // or one inside our own temp dir, so a renderer XSS can't read keys / the vault / ~/.ssh.
  handle("files:read", [str], async (_e, path) => {
    assertReadAllowed(path);
    return new Uint8Array(await readFile(path));
  });

  // Download a remote file (a tool-returned export URL) to a temp path; the renderer then
  // redacts + stores + displays the bytes via files:redact-and-save.
  handle("files:fetch-url", [str], async (_e, url) => {
    // SECURITY: only a host OBSERVED in relayed content, so a renderer XSS can't turn this
    // into an exfil GET to `attacker.com/?d=<secret>`.
    if (!isFetchHostAllowed(url)) {
      throw new Error("URL non autorisée");
    }
    // `safeFetch`: SSRF-safe at every redirect hop, media-only, size-capped, timed out.
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
    // Clamp to a plain alnum extension: it is spliced into the temp path below.
    const ext = /^[a-z0-9]{1,16}$/.test(rawExt) ? rawExt : "";
    const name = base && dot > 0 ? base : `export.${ext || "bin"}`;
    const mime = contentType || extToMime(ext);

    // A 0700 dir + a 0600 file, removed on quit (`appTmpFile.ts`); the random DIRECTORY
    // makes the path unguessable, so the file keeps a real name.
    const path = await writeAppTmpFile("export", `export${ext ? `.${ext}` : ""}`, buf);
    return { path, name, mime };
  });

  // Link-unfurl. The opt-in is enforced in MAIN (default OFF: no unfurl leaks the user's
  // IP before they opt in) and the fetch goes through `safeFetch`; the image comes back
  // as a `data:` URL so the renderer never hits the remote host.
  handle("links:set-enabled", [bool], (_e, on) => {
    linkPreviewsEnabled = on;
  });
  handle("links:preview", [str], (_e, url) => {
    if (!linkPreviewsEnabled) throw new Error("Aperçus de liens désactivés");
    // Same host allow-list as files:fetch-url.
    if (!isFetchHostAllowed(url)) throw new Error("URL non autorisée");
    return previewLink(url);
  });

  // Local file store: BOTH the original bytes and the redacted version.
  handle("files:save", [obj], (_e, f) => dbSaveFile(f as unknown as DbFile));
  handle("files:list", [str], (_e, conversationId) => dbListFiles(conversationId));
  handle("files:load", [str], (_e, id) => dbLoadFile(id));
  handle("files:delete", [str], (_e, id) => dbDeleteFile(id));
  // Conversations that attached the same file (by content hash).
  handle("files:conversations", [str], (_e, hash) =>
    dbConversationsForFile(hash).then((rows) => rows.map((r) => r.conversationId)),
  );
  // Open a stored file in the OS default app (the renderer's CSP blocks `blob:`).
  handle("files:open", [str], async (_e, id) => {
    const data = await dbLoadFile(id);
    if (!data) return false;
    // A 0700 dir holding a 0600 file with the SANITISED display name (never a renderer-
    // supplied id), deleted on quit: these are the DECRYPTED originals. The slug prefix
    // keeps the path inside the read-gate's temp allow-list.
    const path = await writeAppTmpFile("open", safeFileName(data.name), Buffer.from(data.original));
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
    // Original bytes come from EITHER inline `data` (re-attach: bytes the renderer
    // already possesses, no new read capability) OR a granted on-disk `path`, which
    // keeps the same read gate as files:read.
    let original: Uint8Array;
    if (typeof p.data === "string") {
      original = new Uint8Array(Buffer.from(p.data, "base64"));
    } else {
      if (!p.path) throw new Error("Accès fichier refusé : chemin ou données manquants.");
      assertReadAllowed(p.path);
      original = new Uint8Array(await readFile(p.path));
    }
    const vault = { ...p.vault };
    // The classifier must agree with the renderer's message pass on ONE map; pinned by
    // `documentKinds.parity.test.ts`.
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
      // For a BLOCKED format (image/PDF) `spans` is empty although the text WAS
      // redacted on the wire: fall back to the renderer's count (clamped, display-only).
      redactedCount: redacted
        ? spans.length
        : Math.max(0, Math.floor(Number(p.redactedCount) || 0)),
      // RAW text, safe here: it never leaves this encrypted DB and a re-attach re-redacts it.
      extraction: p.extraction,
    });
    // `redacted` = were the BYTES rewritten (an empty `spans` on a PDF is NOT "nothing masked").
    return { vault, kinds, spans, redacted }; // merged into the conversation + log
  });
}
