import type { JsonValue, McpContent, RedactString, Vault } from "../types";

/**
 * Deep-map every string leaf of a JSON value through `fn`, preserving structure
 * (numbers, booleans, null and object keys are left untouched). Used to restore
 * placeholders in model-authored tool arguments before they reach the real
 * server. `fn` is awaited so a model-based engine can be plugged in.
 */
export async function mapStrings(
  value: JsonValue,
  fn: RedactString,
  vault: Vault,
): Promise<JsonValue> {
  if (typeof value === "string") return fn(value, vault);
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (const item of value) out.push(await mapStrings(item, fn, vault));
    return out;
  }
  if (value && typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) out[k] = await mapStrings(v, fn, vault);
    return out;
  }
  return value;
}

/**
 * Transform only the `text` of text content blocks in a tool result — image
 * data and other binary parts are passed through untouched (never redact a
 * base64 blob). Used to re-redact the real server's reply for the model.
 */
export async function mapContentText(
  content: McpContent[],
  fn: RedactString,
  vault: Vault,
): Promise<McpContent[]> {
  const out: McpContent[] = [];
  for (const part of content) {
    if (part.type === "text" && typeof (part as { text?: unknown }).text === "string") {
      out.push({ ...part, text: await fn((part as { text: string }).text, vault) });
    } else {
      out.push(part);
    }
  }
  return out;
}

/** Extract a file's bytes (base64) into plain text (Node-only; injected). */
export type ExtractFile = (dataBase64: string, mimeType: string) => Promise<string>;

/** Downloadable-file extensions we surface from a tool result's TEXT (a signed
 *  export URL, etc.). */
const FILE_EXT_MIME: Record<string, string> = {
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

const FILE_URL_RE =
  /https?:\/\/[^\s"'<>()]+?\.(pdf|png|jpe?g|gif|webp|svg|mp4|pptx|docx|xlsx|csv|zip)(\?[^\s"'<>()]*)?/gi;

/**
 * Image thumbnail / preview URLs from a **vetted allow-list of design hosts**
 * that carry NO file extension, so `FILE_URL_RE` misses them — e.g. a Canva
 * `search-designs` result's `design.canva.ai/<id>` thumbnail. Surfaced like a
 * file URL (stripped from the model, fetched + shown to the user) so the user
 * sees the real preview while the model only ever gets the placeholder. Host-
 * restricted on purpose: we never fetch an arbitrary URL a tool happens to emit,
 * and Canva's `canva.com/d/<id>` EDIT links (a different host) are NOT matched.
 */
/**
 * Vetted design-preview hosts whose thumbnail URLs carry NO file extension (so
 * `FILE_URL_RE` misses them). Matched as a domain suffix (any subdomain). This is
 * an **SSRF / exfiltration surface** — every URL matched here is later fetched by
 * the host — so add hosts ONE BY ONE after vetting, never a broad pattern. Canva's
 * `canva.com/d/<id>` EDIT links are deliberately NOT here (different host, not an
 * image).
 */
export const THUMBNAIL_HOSTS = ["canva.ai"] as const;

const THUMBNAIL_URL_RE = new RegExp(
  `https?://(?:[a-z0-9-]+\\.)*(?:${THUMBNAIL_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|")})/[^\\s"'<>()]+`,
  "gi",
);

/** A downloadable file URL found in a tool result's text. */
export interface FoundFileUrl {
  url: string;
  mimeType: string;
  ext: string;
}

/** Find up to `cap` downloadable file / preview-image URLs in `text` (signed
 *  export links, design-host thumbnails, …), with their inferred mime type.
 *  Extension-based file URLs take priority; extensionless design-host thumbnails
 *  fill the rest. Deduplicated so the same URL is never surfaced twice. */
export function findFileUrls(text: string, cap = 6): FoundFileUrl[] {
  const found: FoundFileUrl[] = [];
  const seen = new Set<string>();
  const add = (url: string, mimeType: string, ext: string): boolean => {
    if (seen.has(url)) return true; // already have it — keep scanning
    seen.add(url);
    found.push({ url, mimeType, ext });
    return found.length < cap;
  };
  for (const m of text.matchAll(FILE_URL_RE)) {
    const ext = m[1].toLowerCase();
    if (!add(m[0], FILE_EXT_MIME[ext] ?? "application/octet-stream", ext)) return found;
  }
  for (const m of text.matchAll(THUMBNAIL_URL_RE)) {
    // Extensionless — real mime is resolved from the fetch's Content-Type; this
    // is only the fallback. `ext: "image"` drives the placeholder label.
    if (!add(m[0], "image/jpeg", "image")) return found;
  }
  return found;
}

/**
 * Strip downloadable file URLs from a text block BEFORE it reaches the model:
 * each URL is reported via `onFileUrl` (so the host can fetch + display the real
 * file to the user) and replaced with a placeholder — a signed export link must
 * never leak to the model. Returns the text with URLs removed.
 */
function stripFileUrls(
  text: string,
  onFileUrl?: (url: string, mimeType: string) => void,
): string {
  const found = findFileUrls(text);
  if (found.length === 0) return text;
  let out = text;
  for (const f of found) {
    onFileUrl?.(f.url, f.mimeType);
    const placeholder =
      f.ext === "image"
        ? "[aperçu image affiché à l'utilisateur, non transmis au modèle]"
        : `[fichier ${f.ext.toUpperCase()} exporté — affiché à l'utilisateur, non transmis au modèle]`;
    out = out.split(f.url).join(placeholder);
  }
  return out;
}

/**
 * Re-redact a tool RESULT for the model, file-aware: `text` blocks are redacted;
 * a block carrying file BYTES (an `image`'s `data`, or a `resource` block's
 * `blob`) is EXTRACTED to text (via `extractFile`), then redacted and replaced
 * with a single `text` block — so the model only ever sees redacted text + a
 * marker, NEVER the raw base64. A resource with inline `text` is redacted too.
 * Bytes with no extractor (or a failed extraction) are replaced with a safe
 * placeholder rather than passed through, so raw file content can't leak.
 */
export async function mapContentFiles(
  content: McpContent[],
  opts: {
    redactText: RedactString;
    extractFile?: ExtractFile;
    vault: Vault;
    /** Called for each downloadable file URL found in a text block. The URL is
     *  stripped from the model-facing text (replaced with a placeholder); the
     *  host uses this to fetch + display the real file to the user. */
    onFileUrl?: (url: string, mimeType: string) => void;
  },
): Promise<McpContent[]> {
  const { redactText, extractFile, vault, onFileUrl } = opts;
  const out: McpContent[] = [];
  for (const part of content) {
    const p = part as Record<string, unknown>;
    const resource = (p.resource ?? null) as Record<string, unknown> | null;

    // 1) Plain text block → strip any file URLs (surfaced to the host), then redact.
    if (p.type === "text" && typeof p.text === "string") {
      out.push({ ...part, text: await redactText(stripFileUrls(p.text, onFileUrl), vault) });
      continue;
    }
    // 2) Embedded resource with inline text → same treatment.
    if (resource && typeof resource.text === "string") {
      out.push({
        ...part,
        resource: {
          ...resource,
          text: await redactText(stripFileUrls(resource.text as string, onFileUrl), vault),
        },
      } as McpContent);
      continue;
    }
    // 3) File BYTES (image `data` / resource `blob`).
    const data =
      typeof p.data === "string" ? (p.data as string)
      : typeof resource?.blob === "string" ? (resource.blob as string)
      : typeof p.blob === "string" ? (p.blob as string)
      : undefined;
    const mimeType =
      (typeof p.mimeType === "string" && (p.mimeType as string)) ||
      (typeof resource?.mimeType === "string" && (resource.mimeType as string)) ||
      "application/octet-stream";
    if (data) {
      let raw = "";
      if (extractFile) {
        try {
          raw = (await extractFile(data, mimeType)).trim();
        } catch {
          raw = "";
        }
      }
      out.push({
        type: "text",
        text: raw
          ? await redactText(`[Fichier ${mimeType}, redacted]\n${raw}`, vault)
          : `[Fichier ${mimeType} reçu — non extractible, retiré pour confidentialité]`,
      });
      continue;
    }
    // 4) No text, no bytes (e.g. a bare resource link) → pass through untouched.
    out.push(part);
  }
  return out;
}

/** Flatten the text parts of a result into one string (for provider messages). */
export function resultText(content: McpContent[]): string {
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}
