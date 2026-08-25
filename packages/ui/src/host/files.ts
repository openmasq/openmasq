import type { Conversation, Settings } from "../types";

/**
 * Optional durable persistence (e.g. a Turso/libSQL database). When present and
 * configured, conversations + their redaction vault are stored there; otherwise
 * the store falls back to localStorage.
 */
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
  /** The EGRESS journal: which origins this machine actually contacted, and which were
   *  refused — newest first. **Read-only by contract**: the platform is the sole writer,
   *  because a record the untrusted renderer could author or erase answers nothing. Rows
   *  carry the ORIGIN only (scheme + host + port), never a path or query — a signed URL
   *  carries its token there. Absent ⇒ the platform makes no outbound calls on the user's
   *  behalf (browser preview) and the section is not drawn: a normal degradation. */
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

export type ExtractedBytes = Pick<ExtractedFile, "text" | "words" | "ocrText" | "ocr" | "ocrPages">; // la part recomputable depuis les octets seuls (route bytes)
export interface ExtractedFile {
  name: string;
  kind: string;
  text: string;
  chars: number;
  error?: string;
  /** La CAUSE BRUTE d'un échec d'extraction, pour le SEUL journal de débogage
   *  (`ocrDebug.ts`) : `error` reste la phrase allow-listée montrée à l'utilisateur ;
   *  ceci distingue un paquet natif manquant d'un PDF corrompu. Jamais rendu hors du
   *  journal (miroir de `@openmasq/redact` `ExtractedFile.rawCause`). */
  rawCause?: string;
  /** Count of DISTINCT values the composer's drop-time redaction found in this file's
   *  text. Forwarded to {@link FilesHost.redactAndSave} so the library card can show the
   *  badge for formats whose BYTES can't be scrubbed in place (image/PDF) — there the
   *  storage pass throws and finds nothing to count. Absent until the file is redacted. */
  redactPreview?: number;
  /** La carte du redaction du DÉPÔT (réel→faux + teinte/catégorie), posée par la passe
   *  de redaction de la pièce jointe. Threadée jusqu'à `redactAndSave` pour être
   *  PERSISTÉE avec le fichier (`ExtractionResult.redactions`) — la Bibliothèque repeint
   *  cette carte-là, pas le coffre de la conversation. */
  replacements?: import("@openmasq/redact/pdf-redact").PdfReplacement[];
  /** Source path on disk (native picks) — lets hidden mode store the original. */
  path?: string;
  /** In-memory ORIGINAL bytes (base64) — set for a RE-ATTACH from the library,
   *  where we already hold the decrypted original and must NOT re-read the
   *  (encrypted, read-gated) on-disk blob. Hidden-mode `redactAndSave` uses this
   *  instead of `path` when present. */
  data?: string;
  /** MIME type (best-effort, by extension). */
  mime?: string;
  /** For an OCR'd IMAGE (scan): the recognised words with their ORIGINAL pixel
   *  boxes, so the viewer can paint the redaction ON the image
   *  (`@openmasq/redact/image-redact` `renderRedactedImage`). */
  words?: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }[];
  /** THE SECOND LAYER (always-OCR). A PDF is ALWAYS OCR'd, not only when its text layer is
   *  thin — content baked into page IMAGES is invisible to the text layer. `text` is the
   *  primary layer (exact text layer, or OCR for a scan); `ocrText` is what the pixels say.
   *  Surfaced so the before-send preview can show BOTH layers side by side (a discrepancy =
   *  hidden/altered text or OCR-only PII). Absent when the OCR layer adds nothing over `text`. */
  ocrText?: string;
  /** How the text was EXTRACTED + how long — surfaced to the Debug Log (Développeur →
   *  Journal de débogage): the OCR engine for an image/scanned PDF, or `"pdf-text"` for a
   *  text-layer PDF (no OCR). Absent for a non-PDF/non-image (docx/xlsx/txt). */
  ocr?: {
    /** `"doctr"` (docTR/Mindee, latin) | `"tesseract"` | `"doctr+tesseract"` | `"pdf-text"`. */
    engine: string;
    ms: number;
    pages?: number;
    /** Total de pages du document — `pages < pagesTotal` = lecture PARTIELLE (plafond
     *  d'OCR, 10 par défaut) : le chip le dit et offre « Lire tout ». */
    pagesTotal?: number;
    confidence?: number;
    fellBack?: boolean;
  };
  /** Per-page GEOMETRY of the two layers (glyph/word boxes) — fuels the send-time HYBRID
   *  detection layer (`send/attachmentLayers.ts`: exact characters re-read in the OCR
   *  order, for a PDF whose text-layer reconstruction is untrustworthy). Types are the
   *  redact core's (single source); optional — a host without geometry degrades to the
   *  plain `text ∪ ocrText` union. NOT persisted on re-attach (recomputable, bulky). */
  textPages?: import("@openmasq/redact/documents.browser").TextLayerPage[];
  ocrPages?: import("@openmasq/redact/documents.browser").OcrLayerPage[];
}
/**
 * The persisted EXTRACTION of a stored file — its text (+ OCR layers). Saved alongside
 * the bytes so a RE-ATTACH reuses it instead of re-running OCR/parsing; the new
 * conversation's send still re-redacted the `text` with ITS own vault (value-based, so
 * the fakes regenerate — we never reuse the old scrubbed copy). It is RAW real PII, so
 * it lives ONLY in the encrypted DB column, never the renderer's plaintext localStorage.
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
  /** La carte de redaction du DÉPÔT (réel→faux + teinte/catégorie), FIGÉE au moment où
   *  ce document est parti. C'est LA source du viewer de la Bibliothèque : le coffre de
   *  la conversation, lui, accumule les valeurs de TOUTE la conversation — le repeindre
   *  sur ce document marquait des éléments que cet envoi n'a jamais redacted (et avec
   *  d'autres teintes, ses `kinds` venant d'un autre producteur). Constaté le 14/08 :
   *  la modale post-dépôt et la Bibliothèque montraient deux redactions différents. */
  redactions?: { real: string; fake: string; tone?: string; kind?: string }[];
}

/** Progression OCR d'une extraction en cours : `{name, page, pages}` par page lue.
 *  Optionnelle de bout en bout — un hôte qui ne la relaie pas dégrade vers la barre
 *  indéterminée du chip, jamais un échec. */
export type OcrProgress = { name: string; page: number; pages: number };

/** Optional file-attachment text extraction (PDF/CSV/text → plain text). */
export interface FilesHost {
  pick(): Promise<ExtractedFile[]>;
  extract(paths: string[], onOcrProgress?: (p: OcrProgress) => void): Promise<ExtractedFile[]>;
  /** « Lire tout » : ré-extraire en levant le plafond d'OCR (10 pages par défaut). Un
   *  scan de 300 pages à quelques secondes la page est un CHOIX de l'utilisateur, pas un
   *  défaut — d'où un geste dédié plutôt qu'un plafond plus haut. Optionnel : absent
   *  (aperçu navigateur), le chip n'offre pas le geste. */
  extractAll?(paths: string[], onOcrProgress?: (p: OcrProgress) => void): Promise<ExtractedFile[]>;
  /** Native picker WITHOUT extraction — returns chosen paths + basenames instantly, so
   *  the composer can show a chip while `extract()` runs async (a big/scanned file's
   *  OCR takes seconds). Absent (browser preview) ⇒ the caller falls back to `pick()`. */
  pickPaths?(): Promise<{ name: string; path: string }[]>;
  /** Read a file's raw bytes from disk — for previewing a not-yet-stored
   *  composer attachment (e.g. rendering a PDF before it's sent). */
  read?(path: string): Promise<Uint8Array>;
  /** In-memory bytes (base64) — MCP tool files + the drop route (bytes, never a path).
   *  STRUCTURÉ : le drop perdait `words`/`ocrText` — l'aperçu ouvrait l'ORIGINALE. */
  extractBytes?(
    data: string,
    name: string,
    mime?: string,
    onOcrProgress?: (p: OcrProgress) => void,
  ): Promise<ExtractedBytes>;
  /** The on-disk path of a DROPPED item. ⚠️ Not a read capability: the platform grants
   *  nothing by answering. Its only sanctioned use is pre-positioning the native folder
   *  picker (`pages/ChatWorkspace/dropIntake.ts`) — a dropped FILE travels as bytes,
   *  which the renderer already holds, never as a path. Absent ⇒ no hint, no fallback. */
  pathForFile?(file: File): string | undefined;
  /** Download a remote file (e.g. a tool-returned export URL) in main to a temp
   *  path — so a signed URL is fetched off the model's path and its bytes can be
   *  redacted + stored + displayed to the user. Returns the temp path + name/mime. */
  fetchUrl?(url: string): Promise<{ path: string; name: string; mime: string }>;
  /** Hidden mode: get the file's ORIGINAL bytes, redact them in place with the
   *  conversation vault, store original + redacted in the files table, and return
   *  the merged vault. The bytes come from EITHER a granted on-disk `path` (native
   *  pick) OR inline `data` (base64) when the renderer already holds them — the
   *  RE-ATTACH case, where the original was loaded (decrypted) from our own DB and
   *  the on-disk blob is encrypted, so re-reading its path is both wrong and
   *  blocked by the read-gate. Provide exactly one of `path` / `data`. */
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
    /** Whether the BYTES were rewritten in place. False for a blocked format (PDF,
     *  image): the stored copy keeps the original bytes — encrypted at rest, with the
     *  send's own redaction untouched. `spans` is then empty BY DESIGN, and a caller
     *  reporting it as « 0 redacted » says the opposite of what happened. Absent on a
     *  host that predates this field ⇒ treat as unknown, never as a failure. */
    redacted?: boolean;
  }>;
}
