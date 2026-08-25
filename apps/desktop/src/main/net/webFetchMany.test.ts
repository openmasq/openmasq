import { describe, it, expect, vi } from "vitest";
import { webFetchMany } from "./webFetchMany";

type FetchImpl = Parameters<typeof webFetchMany>[1] extends { fetchImpl?: infer F } ? NonNullable<F> : never;

const html = (body: string): { finalUrl: string; buf: Buffer; contentType: string } => ({
  finalUrl: "https://x/",
  buf: Buffer.from(`<html><body>${body}</body></html>`, "utf8"),
  contentType: "text/html; charset=utf-8",
});

describe("webFetchMany", () => {
  it("fetches multiple URLs and returns extracted text per URL, in order", async () => {
    const impl: FetchImpl = vi.fn(async (url) => html(`page ${url}`)) as unknown as FetchImpl;
    const out = await webFetchMany(["https://a.test/", "https://b.test/"], { fetchImpl: impl });
    expect(out.map((r) => r.ok)).toEqual([true, true]);
    expect(out[0].text).toContain("page https://a.test/");
    expect(out[1].text).toContain("page https://b.test/");
  });

  it("returns non-HTML text/data raw (JSON/CSV/plain)", async () => {
    const impl: FetchImpl = (async () => ({
      finalUrl: "https://api.test/",
      buf: Buffer.from(`{"price": 42}`, "utf8"),
      contentType: "application/json",
    })) as unknown as FetchImpl;
    const out = await webFetchMany(["https://api.test/"], { fetchImpl: impl });
    expect(out[0]).toMatchObject({ ok: true, text: `{"price": 42}` });
  });

  it("refuses non-http(s) / about:blank WITHOUT calling fetch", async () => {
    const impl = vi.fn() as unknown as FetchImpl;
    const out = await webFetchMany(["ftp://x/", "about:blank", "file:///etc/passwd"], { fetchImpl: impl });
    expect(out.every((r) => !r.ok)).toBe(true);
    expect(impl).not.toHaveBeenCalled();
  });

  it("is fail-closed PER URL — one blocked host does not sink the batch, and leaks no host", async () => {
    const impl: FetchImpl = (async (url: string) => {
      if (url.includes("evil")) throw new Error("Blocked private/internal address: 169.254.169.254");
      return html("bonne page");
    }) as unknown as FetchImpl;
    const out = await webFetchMany(["https://evil.test/", "https://good.test/"], { fetchImpl: impl });
    expect(out[0].ok).toBe(false);
    expect(out[0].error).toBe("adresse interne/privée ou schéma non autorisé");
    expect(out[0].error).not.toContain("169.254"); // host/detail never echoed
    expect(out[1]).toMatchObject({ ok: true });
  });

  it("maps HTTP status and oversize to short reasons", async () => {
    const impl: FetchImpl = (async (url: string) => {
      if (url.includes("404")) throw new Error("Fetch failed (404)");
      throw new Error("Response too large");
    }) as unknown as FetchImpl;
    const out = await webFetchMany(["https://404.test/", "https://big.test/"], { fetchImpl: impl });
    expect(out[0].error).toBe("échec HTTP 404");
    expect(out[1].error).toBe("réponse trop volumineuse");
  });

  it("flags a JS-rendered page (no extractable text) as ok:false", async () => {
    const impl: FetchImpl = (async () => ({
      finalUrl: "https://spa.test/",
      buf: Buffer.from(`<html><body><div id="root"></div><script>render()</script></body></html>`, "utf8"),
      contentType: "text/html",
    })) as unknown as FetchImpl;
    const out = await webFetchMany(["https://spa.test/"], { fetchImpl: impl });
    expect(out[0].ok).toBe(false);
    expect(out[0].error).toMatch(/JavaScript/);
  });

  it("caps fan-out and honours the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const impl: FetchImpl = (async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return html("x");
    }) as unknown as FetchImpl;
    const many = Array.from({ length: 12 }, (_, i) => `https://h${i}.test/`);
    const out = await webFetchMany(many, { fetchImpl: impl, concurrency: 3, maxUrls: 6 });
    expect(out).toHaveLength(6); // maxUrls cap
    expect(peak).toBeLessThanOrEqual(3); // concurrency cap
  });

  it("de-dupes repeated URLs and drops non-strings; empty → []", async () => {
    const impl: FetchImpl = (async () => html("x")) as unknown as FetchImpl;
    const out = await webFetchMany(["https://a.test/", "https://a.test/", 42, null], { fetchImpl: impl });
    expect(out).toHaveLength(1);
    expect(await webFetchMany([], { fetchImpl: impl })).toEqual([]);
    expect(await webFetchMany("not-an-array", { fetchImpl: impl })).toEqual([]);
  });
});

describe("budget de texte PARTAGÉ entre les pages d'un batch", () => {
  const bigPage = (marker: string) =>
    `<html><body><main>${`<p>${marker} contenu utile répété.</p>`.repeat(2000)}</main></body></html>`;
  const fetchStub = (async (url: string) => ({
    finalUrl: url,
    buf: Buffer.from(bigPage(url.includes("a.") ? "AAA" : "BBB")),
    contentType: "text/html",
  })) as never;
  it("1 page → cap plein ; 4 pages → le pool se partage (chacune bien plus courte)", async () => {
    const [one] = await webFetchMany(["https://a.example/"], { fetchImpl: fetchStub });
    const four = await webFetchMany(
      ["https://a.example/1", "https://a.example/2", "https://b.example/3", "https://b.example/4"],
      { fetchImpl: fetchStub },
    );
    expect(one.ok).toBe(true);
    expect(four.every((r) => r.ok)).toBe(true);
    const oneLen = one.text!.length;
    const fourMax = Math.max(...four.map((r) => r.text!.length));
    expect(oneLen).toBeGreaterThan(15_000); // cap plein pour une page seule
    expect(fourMax).toBeLessThan(9_000); // ~32k/4 avec le marqueur de troncature
  });
});
