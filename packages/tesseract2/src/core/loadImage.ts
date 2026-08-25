import { ValidationError } from './errors';
import { looksLikeUrl } from './validate';
import { fetchToLimit } from './httpFetch';
import { base64ToBytes } from './bytes';

export interface LoadImageOptions {
  maxImageBytes: number;
  fetchTimeout: number;
  allowUnknownFormats?: boolean;
  /** Reads a `file:`/fs-path image. Node provides it; the browser omits it, so a path/file:
   *  input is rejected (fail-closed) — the browser feeds bytes/Blobs/data-URLs. */
  readFile?: (spec: string, maxImageBytes: number) => Promise<Uint8Array>;
}

/*
 * Magic-byte sniffing for the formats Leptonica can decode. Unrecognized
 * bytes are rejected before being handed to the WASM core (tesseract.js
 * forwarded anything); opt out with `allowUnknownFormats: true`.
 */
export const sniffFormat = (u8: Uint8Array): string | null => {
  if (u8.length < 12) return null;
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png';
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg';
  if (u8[0] === 0x42 && u8[1] === 0x4d) return 'bmp';
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46
    && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
  if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a && u8[3] === 0x00)
    || (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0x00 && u8[3] === 0x2a)) return 'tiff';
  if (u8[0] === 0x50 && u8[1] >= 0x31 && u8[1] <= 0x36
    && (u8[2] === 0x0a || u8[2] === 0x0d || u8[2] === 0x20 || u8[2] === 0x09)) return 'pnm';
  if (u8[0] === 0x00 && u8[1] === 0x00 && u8[2] === 0x00 && u8[3] === 0x0c
    && u8[4] === 0x6a && u8[5] === 0x50) return 'jp2';
  return null;
};

const checkSize = (byteLength: number, maxImageBytes: number, source: string): void => {
  if (byteLength === 0) throw new ValidationError(`Image is empty (${source}).`);
  if (byteLength > maxImageBytes) {
    throw new ValidationError(`Image exceeds maxImageBytes (${byteLength} > ${maxImageBytes} bytes, ${source}). Raise \`maxImageBytes\` if intentional.`);
  }
};

const fromDataUrl = (image: string, maxImageBytes: number): Uint8Array => {
  const comma = image.indexOf(',');
  if (comma === -1) throw new ValidationError('Malformed data: URL (no comma).');
  const header = image.slice(0, comma);
  const body = image.slice(comma + 1);
  // Cheap pre-decode size cap: base64 inflates by ~4/3.
  checkSize(Math.floor(body.length * 0.75), maxImageBytes, 'data URL');
  if (/;base64$/i.test(header)) return base64ToBytes(body);
  const text = decodeURIComponent(body);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};

// Follows redirects MANUALLY re-validating the scheme per hop (audit M2) and streams the
// body with an INCREMENTAL byte cap (audit M3), so a lying content-length can't force an
// unbounded RAM buffer. `fetchTimeout: 0` = no timeout (audit L2).
const fromHttpUrl = (image: string, { maxImageBytes, fetchTimeout }: LoadImageOptions): Promise<Uint8Array> =>
  fetchToLimit(image, { maxBytes: maxImageBytes, timeoutMs: fetchTimeout, requireHttps: false });

/*
 * Accepts Uint8Array / ArrayBuffer (a Node Buffer is a Uint8Array), a filesystem path,
 * a file:, http(s): or data: URL. Always returns a *fresh* Uint8Array backed by its
 * own ArrayBuffer, safe to transfer to the worker thread.
 */
export const loadImage = async (image: unknown, opts: LoadImageOptions): Promise<Uint8Array> => {
  const { maxImageBytes, allowUnknownFormats = false } = opts;
  let data: Uint8Array;

  if (image === undefined || image === null) {
    throw new ValidationError('No image provided.');
  } else if (image instanceof Uint8Array) {
    checkSize(image.byteLength, maxImageBytes, 'buffer');
    data = image;
  } else if (image instanceof ArrayBuffer) {
    checkSize(image.byteLength, maxImageBytes, 'ArrayBuffer');
    data = new Uint8Array(image.slice(0));
  } else if (typeof image === 'string') {
    if (image.startsWith('data:')) {
      data = fromDataUrl(image, maxImageBytes);
    } else if (looksLikeUrl(image)) {
      const url = new URL(image);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        data = await fromHttpUrl(image, opts);
      } else if (url.protocol === 'file:') {
        if (!opts.readFile) throw new ValidationError('file: image inputs are not supported in this environment. Pass bytes, an ArrayBuffer, a data: or http(s): URL.');
        data = await opts.readFile(image, maxImageBytes);
      } else {
        throw new ValidationError(`Unsupported URL protocol for images: ${url.protocol}`);
      }
    } else {
      if (!opts.readFile) throw new ValidationError('filesystem-path image inputs are not supported in this environment. Pass bytes, an ArrayBuffer, a data: or http(s): URL.');
      data = await opts.readFile(image, maxImageBytes);
    }
  } else {
    throw new ValidationError(`Unsupported image input type: ${typeof image}. Use a Buffer, Uint8Array, ArrayBuffer, path or URL.`);
  }

  // Fresh copy => owns its ArrayBuffer, transferable without side effects.
  const out = new Uint8Array(data);
  checkSize(out.byteLength, maxImageBytes, 'image');

  if (!allowUnknownFormats && sniffFormat(out) === null) {
    throw new ValidationError('Unrecognized image format (expected PNG, JPEG, BMP, GIF, WebP, TIFF, PNM or JP2). Pass `allowUnknownFormats: true` to bypass this check.');
  }
  return out;
};
