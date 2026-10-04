import { describe, it, expect } from "vitest";
import { rewriteSearchEngine, isAllowedBrowserUrl } from "./browserTools";

describe("rewriteSearchEngine — Google → DuckDuckGo (the default engine)", () => {
  it("rewrites a Google web search to the MAIN duckduckgo.com SERP, preserving the query", () => {
    expect(rewriteSearchEngine("https://www.google.com/search?q=meilleurs+ETF+2026")).toBe(
      "https://duckduckgo.com/?q=meilleurs+ETF+2026",
    );
  });
  it("⚠️ never targets html.duckduckgo.com (its no-JS SERP serves a Cloudflare bot challenge)", () => {
    const out = rewriteSearchEngine("https://google.fr/search?q=x");
    expect(out).toContain("//duckduckgo.com/");
    expect(out).not.toContain("html.duckduckgo.com");
  });
  it("re-encodes the query safely (special chars survive the round-trip)", () => {
    expect(rewriteSearchEngine("https://www.google.com/search?q=a%20%26%20b")).toBe(
      "https://duckduckgo.com/?q=a+%26+b",
    );
  });
  it("leaves a non-search Google URL untouched (only /search is rewritten)", () => {
    expect(rewriteSearchEngine("https://www.google.com/maps")).toBe("https://www.google.com/maps");
  });
  it("leaves a non-Google URL untouched", () => {
    expect(rewriteSearchEngine("https://example.com/search?q=x")).toBe("https://example.com/search?q=x");
    expect(rewriteSearchEngine("https://duckduckgo.com/?q=x")).toBe("https://duckduckgo.com/?q=x");
  });
  it("passes an unparseable string through (isAllowedBrowserUrl rejects it downstream)", () => {
    expect(rewriteSearchEngine("not a url")).toBe("not a url");
    expect(isAllowedBrowserUrl("not a url")).toBe(false);
  });
});

describe("a navigation URL's credentials and look-alike search hosts", () => {
  it("refuses any navigation carrying credentials — that slot reaches the host like a query", () => {
    expect(isAllowedBrowserUrl("https://Jean%20Dupont@evil.io/")).toBe(false);
    expect(isAllowedBrowserUrl("https://u:p@example.com/")).toBe(false);
    expect(isAllowedBrowserUrl("https://example.com/")).toBe(true);
  });

  it("rewrites only Google's own search domains", () => {
    expect(rewriteSearchEngine("https://google.attacker.example/search?q=x")).toBe(
      "https://google.attacker.example/search?q=x",
    );
    expect(rewriteSearchEngine("https://www.google.fr/search?q=x")).toContain("duckduckgo.com");
  });
});
