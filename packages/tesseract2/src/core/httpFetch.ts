import { NetworkError, ValidationError } from './errors';

/*
 * One hardened download path for traineddata + remote images. Closes three audit
 * findings the naive `fetch(url,{redirect:'follow'})` had:
 *   - M2 (scheme downgrade via redirect): redirects are followed MANUALLY and the
 *     scheme is re-validated on EVERY hop, so a CDN/mirror can't 30x an https-only
 *     traineddata URL down to plain http;
 *   - M3 (size checked after full buffering): the body is streamed and the byte cap
 *     is enforced INCREMENTALLY, so a lying/omitted `content-length` can't make us
 *     buffer an unbounded response in RAM before the check;
 *   - L2 (fetchTimeout: 0 = instant abort): a 0 timeout means "no timeout" (no
 *     AbortSignal), instead of `AbortSignal.timeout(0)` which cancels immediately.
 */
export interface FetchToLimitOpts {
  maxBytes: number;
  timeoutMs: number;
  /** When true, EVERY hop must be https (traineddata). When false, http(s) only (images). */
  requireHttps: boolean;
}

const MAX_REDIRECTS = 5;

const schemeOk = (u: URL, requireHttps: boolean): boolean =>
  requireHttps ? u.protocol === 'https:' : u.protocol === 'http:' || u.protocol === 'https:';

const readStreamCapped = async (res: Response, maxBytes: number, where: string): Promise<Uint8Array> => {
  const body = res.body;
  if (!body) {
    // No stream (unusual) — fall back to a buffered read, still capped after the fact.
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new ValidationError(`${where} exceeds the byte cap (${buf.byteLength} > ${maxBytes}).`);
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Abort as soon as we cross the cap — never buffer the whole hostile body.
        await reader.cancel().catch(() => {});
        throw new ValidationError(`${where} exceeds the byte cap (> ${maxBytes} bytes) — aborted mid-stream.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
};

export const fetchToLimit = async (url: string, opts: FetchToLimitOpts): Promise<Uint8Array> => {
  const { maxBytes, timeoutMs, requireHttps } = opts;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new ValidationError(`Invalid URL: ${current}`);
    }
    if (!schemeOk(u, requireHttps)) {
      throw new NetworkError(
        requireHttps
          ? `Refusing a non-https URL (language data is executable-adjacent): ${current}`
          : `Unsupported URL scheme "${u.protocol}": ${current}`,
      );
    }
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual', // we follow + re-validate the scheme ourselves
        signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (err) {
      throw new NetworkError(`Failed to fetch ${current}: ${(err as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const loc = res.headers.get('location');
      if (!loc) throw new NetworkError(`Redirect (${res.status}) with no Location header from ${current}`);
      current = new URL(loc, current).toString(); // resolve a relative Location, re-check next hop
      continue;
    }
    if (!res.ok) throw new NetworkError(`Failed to fetch ${current}: HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      throw new ValidationError(`${current} declares ${declared} bytes, over the cap (${maxBytes}).`);
    }
    return readStreamCapped(res, maxBytes, current);
  }
  throw new NetworkError(`Too many redirects (> ${MAX_REDIRECTS}) fetching ${url}`);
};
