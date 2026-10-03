import {
  isSafeThumbnail,
  STREAM_MAX_PAGES,
  STREAM_PAGE_MAX_CHARS,
  THUMB_MAX_BYTES,
  type ExtractStreamEvent,
} from "@openmasq/redact/documents";

/**
 * The extraction worker's PREVIEW stream, as main relays it (`files:extract-stream`). The
 * worker is ours, but what it read is the FILE's — a crafted PDF decides page sizes and
 * texts — so every message is rebuilt from an ALLOW-listed shape, bounded, and anything else
 * is dropped (fail closed: no preview rather than an unchecked one):
 *  • a page: `n` within `1..total`, `total` within `STREAM_MAX_PAGES`, `read` a boolean, its
 *    text (optional) a string of at most `STREAM_PAGE_MAX_CHARS`;
 *  • a thumbnail: base64 of a PNG that `isSafeThumbnail` accepts — within the pinned pixel
 *    bound, so it is unreadable whatever produced it — re-encoded as a `data:` URL.
 * Pinned by `extractStream.test.ts`.
 */
export function checkStreamMessage(msg: unknown): ExtractStreamEvent | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { page?: unknown; thumb?: unknown };
  if (m.page !== undefined) return checkPage(m.page);
  if (m.thumb !== undefined) return checkThumb(m.thumb);
  return null;
}

const pageIndex = (n: unknown, total: unknown): n is number =>
  Number.isInteger(total) &&
  (total as number) >= 1 &&
  (total as number) <= STREAM_MAX_PAGES &&
  Number.isInteger(n) &&
  (n as number) >= 1 &&
  (n as number) <= (total as number);

function checkPage(raw: unknown): ExtractStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as { n?: unknown; total?: unknown; read?: unknown; text?: unknown };
  if (!pageIndex(p.n, p.total) || typeof p.read !== "boolean") return null;
  if (p.text !== undefined && (typeof p.text !== "string" || p.text.length > STREAM_PAGE_MAX_CHARS)) return null;
  const page = { n: p.n, total: p.total as number, read: p.read };
  return { page: typeof p.text === "string" ? { ...page, text: p.text } : page };
}

/** Base64 of `THUMB_MAX_BYTES` bytes, with padding. */
const MAX_B64 = Math.ceil(THUMB_MAX_BYTES / 3) * 4;

function checkThumb(raw: unknown): ExtractStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { n?: unknown; total?: unknown; png?: unknown };
  if (!pageIndex(t.n, t.total) || typeof t.png !== "string" || t.png.length > MAX_B64) return null;
  const png = new Uint8Array(Buffer.from(t.png, "base64"));
  if (!isSafeThumbnail(png)) return null;
  return { thumb: { n: t.n, total: t.total as number, src: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } };
}
