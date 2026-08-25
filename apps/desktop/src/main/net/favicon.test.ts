import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the hardened download so we test the favicon-SPECIFIC guards (raster-only,
// scheme skip, fail-closed, data-URL build) — the SSRF/size/timeout floor is
// safeFetch's own contract, covered by net.test.ts.
const safeFetch = vi.fn();
vi.mock("./net", () => ({ safeFetch: (...a: unknown[]) => safeFetch(...a) }));

const { fetchFaviconDataUrl } = await import("./favicon");

const res = (contentType: string, bytes: number[]) => ({
  finalUrl: "https://x/icon",
  buf: Buffer.from(bytes),
  contentType,
});

beforeEach(() => safeFetch.mockReset());

describe("fetchFaviconDataUrl", () => {
  it("returns a data: URL for a raster favicon, via the hardened path", async () => {
    safeFetch.mockResolvedValue(res("image/png", [1, 2, 3]));
    expect(await fetchFaviconDataUrl("https://example.com/favicon.png")).toBe(
      `data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`,
    );
    // Security contract: it delegates to safeFetch (SSRF/redirect/timeout floor) with a
    // hard size cap — never a raw unbounded fetch.
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/favicon.png",
      expect.objectContaining({ accept: "image", maxBytes: 128 * 1024, timeoutMs: 5000 }),
    );
  });

  it("REJECTS an SVG favicon (raster-only, no scriptable payload) → null", async () => {
    safeFetch.mockResolvedValue(res("image/svg+xml", [1]));
    expect(await fetchFaviconDataUrl("https://example.com/icon.svg")).toBeNull();
  });

  it("rejects a non-image / unknown content-type → null", async () => {
    safeFetch.mockResolvedValue(res("text/html", [1]));
    expect(await fetchFaviconDataUrl("https://example.com/x")).toBeNull();
  });

  it("returns null for an empty body", async () => {
    safeFetch.mockResolvedValue(res("image/png", []));
    expect(await fetchFaviconDataUrl("https://example.com/x.png")).toBeNull();
  });

  it("fails CLOSED when safeFetch throws (SSRF-refused / too big / network) → null", async () => {
    safeFetch.mockImplementationOnce(() => Promise.reject(new Error("Refused private address")));
    const out = await fetchFaviconDataUrl("https://internal/favicon.ico").catch(() => "THREW");
    expect(out).toBeNull();
  });

  it("skips a non-http(s) scheme WITHOUT fetching (data: / ftp: / garbage)", async () => {
    expect(await fetchFaviconDataUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(await fetchFaviconDataUrl("ftp://x/f.ico")).toBeNull();
    expect(await fetchFaviconDataUrl("not a url")).toBeNull();
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("strips content-type params when building the data URL", async () => {
    safeFetch.mockResolvedValue(res("image/x-icon; charset=binary", [9]));
    expect(await fetchFaviconDataUrl("https://example.com/favicon.ico")).toBe(
      `data:image/x-icon;base64,${Buffer.from([9]).toString("base64")}`,
    );
  });
});
