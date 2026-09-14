/**
 * The BODY half of `safeFetch`: what a response may BE (one Content-Type allow-list per
 * `accept`) and how it is READ (size-capped WHILE streaming; optionally handed to a sink
 * chunk by chunk instead of buffered). Split from `net.ts` so the SSRF decision — host,
 * hop, pinned address — reads on its own; nothing here ever touches a host.
 */

export type FetchAccept = "html" | "image" | "media" | "text" | "binary";

const MEDIA_CONTENT_TYPES = [
  "image/",
  "application/pdf",
  "video/mp4",
  "text/csv",
  "application/zip",
  "application/octet-stream", // some signed-export hosts mislabel binaries
  "application/vnd.openxmlformats-officedocument.", // pptx/docx/xlsx
];

// `accept:"text"` — the batch web reader (`webFetchMany.ts`) accepts a page or a
// text-shaped DATA response. Non-executable types only: NO `application/javascript`
// (the reader never runs it, and refusing it keeps the accept honest — we fetch
// documents/data, not code). Everything is still http(s), SSRF-checked per hop,
// size-capped and timed out exactly like the other accepts.
const TEXT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "text/xml",
  "application/xml",
  "application/rss+xml",
  "application/atom+xml",
];

/**
 * `accept:"binary"` — an artefact the caller will VERIFY against a pinned sha256 before
 * anything runs it (a subscription CLI's official build: `subscription/install/`). The
 * download path is the same as every other accept (per-hop SSRF, cap, timeout, host
 * allow-list); what makes EXECUTING the bytes safe is the pin the caller checks, never
 * this list. Measured labels: `application/octet-stream` on GitHub's release-asset host
 * and on downloads.claude.ai for the mac and linux binaries — and
 * `application/x-msdos-program` for its Windows `claude.exe` (measured 14/09/2026: the
 * same origin labels the `.exe` by extension, and the list refused it, so the in-app
 * install of Claude Code on Windows died at the download with no reason kept anywhere).
 * `application/vnd.microsoft.portable-executable` is the registered name for the same
 * thing, admitted so a relabel does not repeat that.
 */
const BINARY_CONTENT_TYPES = [
  "application/octet-stream",
  "binary/octet-stream",
  "application/gzip",
  "application/x-gzip",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
];

export function contentTypeOk(ct: string, accept: FetchAccept): boolean {
  const t = ct.split(";")[0].trim().toLowerCase();
  if (accept === "html") return t === "text/html" || t === "application/xhtml+xml";
  if (accept === "image") return t.startsWith("image/");
  if (accept === "text") return TEXT_CONTENT_TYPES.includes(t);
  if (accept === "binary") return BINARY_CONTENT_TYPES.includes(t);
  return MEDIA_CONTENT_TYPES.some((p) => t.startsWith(p));
}

/**
 * Read a response body, aborting past `maxBytes`. With a `sink`, every chunk goes to it
 * as it arrives and NOTHING is retained (the returned buffer is empty): that is how a
 * 200 MB binary reaches the disk and the hash without ever being whole in memory. The
 * cap is enforced the same way on both paths — a declared length over it is refused
 * before the first byte, and a body that lies about its length is cut where it crosses.
 */
export async function readCapped(
  res: Response,
  maxBytes: number,
  sink?: (chunk: Uint8Array) => void,
): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Response too large");
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    if (sink) sink(value);
    else chunks.push(Buffer.from(value));
  }
  return sink ? Buffer.alloc(0) : Buffer.concat(chunks);
}
