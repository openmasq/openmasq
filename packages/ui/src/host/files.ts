import type { Conversation, Settings } from "../types";

/** One outbound decision, as the platform recorded it. */
export interface EgressEntry {
  at: number;
  /** `https://example.com` — scheme + host + non-default port. Never a path or query. */
  origin: string;
  /** Which subsystem asked: `browser`, `connector`, `link-preview`, `fetch-url`… */
  source: string;
  verdict: "allowed" | "refused";
  /** Our own wording on a refusal (`private address`, `DNS failure`) — never the remote's. */
  reason?: string;
}

export interface DbHost {
  configured(): Promise<boolean>;
  /** Point the local DB at the SIGNED-IN ACCOUNT's own file (per-account isolation —
   *  a shared machine must never surface one account's chats to another). Called on
   *  sign-in and on account SWITCH, BEFORE `load()`; `null` = signed out (close the
   *  DB). Absent ⇒ single shared DB (legacy / browser preview, which has no db). */
  setUser?(userId: string | null): Promise<void>;
  load(): Promise<{
    conversations: Conversation[];
    settings: Partial<Settings> | null;
  } | null>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** Persist the DEBUG JOURNAL ring (whole-buffer JSON). Entries hold wire text AND
   *  vault values (real PII), so the implementation MUST store it with the same
   *  at-rest guarantee as the vault (per-account encrypted DB) — never a plaintext
   *  file, never localStorage, never network. Absent ⇒ the journal stays memory-only
   *  (browser preview / mobile), a normal degradation, not an error. */
  saveDebugJournal?(json: string): Promise<void>;
  /** Load the persisted debug journal ring for the CURRENT account (after `setUser`).
   *  `null` = none stored. */
  loadDebugJournal?(): Promise<string | null>;
  /** The EGRESS journal: origins this machine contacted and which were refused, newest
   *  first. Read-only by contract: the platform is the sole writer (a record the untrusted
   *  renderer could author answers nothing). Rows carry the ORIGIN only, never a path or
   *  query (a signed URL carries its token there). Absent ⇒ the section is not drawn. */
  listEgress?(limit?: number): Promise<EgressEntry[]>;
  /** Store an attached file locally (original + redacted bytes). */
  saveFile?(file: StoredFile): Promise<void>;
  /** File metadata for a conversation (no blobs). */
  listFiles?(conversationId: string): Promise<FileMeta[]>;
  /** Load one file's bytes (original + redacted) for viewing / export. `extraction` is
   *  the persisted extract (text/OCR) when the file was stored with one — reused on
   *  RE-ATTACH to skip re-running OCR/parsing (null for old rows → the caller re-extracts). */
  loadFile?(
    id: string,
  ): Promise<{
    name: string;
    mime: string;
    original: Uint8Array;
    scrubbed: Uint8Array | null;
    extraction?: ExtractionResult | null;
  } | null>;
  /** Delete one stored file (unlink its blobs + drop the row). Powers the library's
   *  per-file delete — e.g. removing worthless auto-saved scraped images. */
  deleteFile?(id: string): Promise<void>;
  /** Distinct conversation (storage) ids that attached the file with this content
   *  hash — powers the library's "used in N conversations" + re-attach. */
  conversationsForFile?(hash: string): Promise<string[]>;
  /** Open a stored file in the OS default app (main writes a temp + shell.openPath). */
  openFile?(id: string): Promise<boolean>;
}
export interface StoredFile {
  id: string;
  conversationId: string;
  name: string;
  mime: string;
  redacted: boolean;
  original: Uint8Array;
  scrubbed?: Uint8Array | null;
  createdAt?: number;
}
export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  redacted: boolean;
  createdAt: number;
  /** sha256 of the original bytes — the file's identity across conversations. */
  contentHash?: string | null;
  /** On-disk path of the stored original — passed back as an attachment `path`
   *  so re-attaching re-stores + re-redacts the file in the new conversation. */
  originalPath?: string;
  /** Count of DISTINCT masked values in this file — the library card's "N masqués"
   *  badge. 0 (or absent) for a non-redacted file or an old row pre-migration. */
  redactedCount?: number;
}

// The part recomputable from bytes alone, plus the REFUSAL — a verdict the caller must not discard.
export type ExtractedBytes = Pick<
  ExtractedFile,
  "text" | "words" | "ocrText" | "ocr" | "ocrPages" | "error" | "blocked"
>;
export interface ExtractedFile {
  name: string;
  kind: string;
  text: string;
  chars: number;
  error?: string;
  /** The pre-parse SAFETY gate REFUSED this file (`@openmasq/redact` `guardUpload`; reason
   *  in `error`). NOT "extraction failed": nothing parsed the bytes. A refused file must
   *  not be attached and must never travel with its `data`. */
  blocked?: boolean;
  /** The RAW CAUSE of an extraction failure, for the debug journal ONLY
   *  (`ocrDebug.ts`): `error` stays the allow-listed phrase shown to the user;
   *  this distinguishes a missing native package from a corrupt PDF. Never rendered outside the
   *  journal (mirrors `@openmasq/redact` `ExtractedFile.rawCause`). */
  rawCause?: string;
  /** Count of DISTINCT values the drop-time redaction found in this file's text, forwarded
   *  to {@link FilesHost.redactAndSave} for formats whose BYTES can't be scrubbed in place. */
  redactPreview?: number;
  /** The DROP's redaction map (real→fake + tone/category), laid down by the
   *  attachment's redaction pass. Threaded through to `redactAndSave` to be
   *  PERSISTED with the file (`ExtractionResult.redactions`) — the Bibliothèque repaints
   *  THAT map, not the conversation's coffre. */
  replacements?: import("@openmasq/redact/pdf-redact").PdfReplacement[];
  /** Source path on disk (native picks) — lets hidden mode store the original. */
  path?: string;
  /** In-memory ORIGINAL bytes (base64) for a RE-ATTACH from the library: the decrypted
   *  original is already held and the on-disk blob is encrypted and read-gated. */
  data?: string;
  /** MIME type (best-effort, by extension). */
  mime?: string;
  /** For an OCR'd IMAGE (scan): the recognised words with their ORIGINAL pixel
   *  boxes, so the viewer can paint the redaction ON the image
   *  (`@openmasq/redact/image-redact` `renderRedactedImage`). */
  words?: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }[];
  /** THE SECOND LAYER: a PDF is ALWAYS OCR'd, because content baked into page images is
   *  invisible to the text layer. `text` is the primary layer, `ocrText` what the pixels
   *  say; a discrepancy = hidden text or OCR-only PII. Absent when OCR adds nothing. */
  ocrText?: string;
  /** How the text was EXTRACTED + how long — surfaced to the Debug Log (Développeur →
   *  Journal de débogage): the OCR engine for an image/scanned PDF, or `"pdf-text"` for a
   *  text-layer PDF (no OCR). Absent for a non-PDF/non-image (docx/xlsx/txt). */
  ocr?: {
    /** `"doctr"` (docTR/Mindee, latin) | `"tesseract"` | `"doctr+tesseract"` | `"pdf-text"`. */
    engine: string;
    ms: number;
    pages?: number;
    /** Total pages in the document — `pages < pagesTotal` = PARTIAL read (OCR
     *  cap, 10 by default): the chip says so and offers « Lire tout ». */
    pagesTotal?: number;
    confidence?: number;
    fellBack?: boolean;
  };
  /** Per-page GEOMETRY of the two layers, for the send-time HYBRID detection
   *  (`send/attachmentLayers.ts`). Optional; not persisted on re-attach (recomputable, bulky). */
  textPages?: import("@openmasq/redact/documents.browser").TextLayerPage[];
  ocrPages?: import("@openmasq/redact/documents.browser").OcrLayerPage[];
}
/**
 * The persisted EXTRACTION of a stored file, saved beside the bytes so a RE-ATTACH reuses
 * it instead of re-running OCR. The new conversation still re-redacts `text` with ITS own
 * vault. RAW real PII: lives ONLY in the encrypted DB column, never in localStorage.
 */
export interface ExtractionResult {
  text: string;
  /** A PDF's second (always-OCR) layer — persisted so reuse keeps the two-layer
   *  (text ∪ ocrText) fail-closed detection of image-baked PII (`documents/` core). */
  ocrText?: string;
  /** OCR word boxes (image scans) — persisted so a scan can be re-painted without re-OCR. */
  words?: ExtractedFile["words"];
  /** Per-page OCR word geometry (SCANNED PDFs) — the PDF analogue of `words`:
   *  persisted so the post-send viewer can paint a scan's redaction boxes
   *  (`PdfRedactedViewer.ocrPages`) without re-running OCR. */
  ocrPages?: ExtractedFile["ocrPages"];
  /** How the text was extracted (engine + timings) — carried for the Debug Log. */
  ocr?: ExtractedFile["ocr"];
  /** The DROP's redaction map, FROZEN when this document went out — THE source for the
   *  Bibliothèque's viewer. The conversation's coffre accumulates values from the whole
   *  conversation and would mark elements this send never redacted. */
  redactions?: { real: string; fake: string; tone?: string; kind?: string }[];
}

/** OCR progress for an extraction in flight: `{name, page, pages}` per page read.
 *  Optional end to end — a host that doesn't relay it degrades to the chip's
 *  indeterminate bar, never a failure. */
export type OcrProgress = { name: string; page: number; pages: number };

/** Optional file-attachment text extraction (PDF/CSV/text → plain text). */
export interface FilesHost {
  pick(): Promise<ExtractedFile[]>;
  extract(paths: string[], onOcrProgress?: (p: OcrProgress) => void): Promise<ExtractedFile[]>;
  /** « Lire tout »: re-extract while lifting the OCR cap (10 pages by default). A
   *  300-page scan at a few seconds per page is a CHOICE the user makes, not a
   *  default — hence a dedicated action rather than a higher cap. Optional: absent
   *  (browser preview), the chip doesn't offer the action. */
  extractAll?(paths: string[], onOcrProgress?: (p: OcrProgress) => void): Promise<ExtractedFile[]>;
  /** Native picker WITHOUT extraction — returns chosen paths + basenames instantly, so
   *  the composer can show a chip while `extract()` runs async (a big/scanned file's
   *  OCR takes seconds). Absent (browser preview) ⇒ the caller falls back to `pick()`. */
  pickPaths?(): Promise<{ name: string; path: string }[]>;
  /** Read a file's raw bytes from disk — for previewing a not-yet-stored
   *  composer attachment (e.g. rendering a PDF before it's sent). */
  read?(path: string): Promise<Uint8Array>;
  /** In-memory bytes (base64) — MCP tool files + the drop route. STRUCTURED result so the
   *  preview keeps `words`/`ocrText`. */
  extractBytes?(
    data: string,
    name: string,
    mime?: string,
    onOcrProgress?: (p: OcrProgress) => void,
  ): Promise<ExtractedBytes>;
  /** The on-disk path of a DROPPED item. ⚠️ Not a read capability. Its only sanctioned use
   *  is pre-positioning the native folder picker (`pages/ChatWorkspace/dropIntake.ts`); a
   *  dropped FILE travels as bytes. Absent ⇒ no hint. */
  pathForFile?(file: File): string | undefined;
  /** Download a remote file (e.g. a tool-returned export URL) in main to a temp
   *  path — so a signed URL is fetched off the model's path and its bytes can be
   *  redacted + stored + displayed to the user. Returns the temp path + name/mime. */
  fetchUrl?(url: string): Promise<{ path: string; name: string; mime: string }>;
  /** Hidden mode: redact the file's ORIGINAL bytes in place with the conversation vault,
   *  store original + redacted, return the merged vault. Bytes come from EITHER a granted
   *  `path` OR inline `data` (the RE-ATTACH case: the on-disk blob is encrypted and
   *  read-gated). Provide exactly one. */
  redactAndSave?(p: {
    id: string;
    conversationId: string;
    path?: string;
    /** Base64 original bytes, used instead of reading `path` (re-attach). */
    data?: string;
    name: string;
    mime: string;
    vault: Record<string, string>;
    disabledKinds?: string[];
    /** Drop-time distinct-redaction count for the file's TEXT. Stored as the file's
     *  `redactedCount` for formats that can't be scrubbed in place (image/PDF), whose
     *  in-place pass throws and would otherwise record 0. Display metadata only — the
     *  renderer is untrusted, so main clamps it and never treats it as a security gate. */
    redactedCount?: number;
    /** The file's already-computed extraction (text + OCR), persisted so a later
     *  RE-ATTACH skips re-extraction. Absent ⇒ nothing stored (the reattach re-extracts). */
    extraction?: ExtractionResult;
  }): Promise<{
    vault: Record<string, string>;
    kinds: Record<string, string>;
    spans: { value: string; kind: string }[];
    /** Whether the BYTES were rewritten in place. False for PDF/image: the stored copy
     *  keeps the original bytes (encrypted at rest); `spans` is then empty BY DESIGN, not
     *  « 0 masqués ». Absent ⇒ unknown, never a failure. */
    redacted?: boolean;
  }>;
}
