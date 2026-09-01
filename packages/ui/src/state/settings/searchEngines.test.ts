import { describe, it, expect } from "vitest";
import { SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, searchEngineById, searchUrl } from "./searchEngines";

describe("searchEngines", () => {
  it("has the default engine (duckduckgo) first", () => {
    expect(SEARCH_ENGINES[0].id).toBe(DEFAULT_SEARCH_ENGINE);
    expect(DEFAULT_SEARCH_ENGINE).toBe("duckduckgo");
  });

  it("every engine has a brand glyph + colour", () => {
    for (const e of SEARCH_ENGINES) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(e.hex).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });

  it("resolves by id, falling back to the default for unknown/undefined", () => {
    expect(searchEngineById("google").id).toBe("google");
    expect(searchEngineById(undefined).id).toBe(DEFAULT_SEARCH_ENGINE);
    expect(searchEngineById("nope").id).toBe(DEFAULT_SEARCH_ENGINE);
  });

  it("builds an encoded search URL on the chosen engine", () => {
    expect(searchUrl("duckduckgo", "chats mignons")).toBe(
      "https://duckduckgo.com/?q=chats%20mignons",
    );
    expect(searchUrl("brave", "a&b")).toBe("https://search.brave.com/search?q=a%26b");
    expect(searchUrl("google", "x")).toBe("https://www.google.com/search?q=x");
    expect(searchUrl("ecosia", "x")).toBe("https://www.ecosia.org/search?q=x");
    expect(searchUrl("startpage", "x")).toBe("https://www.startpage.com/sp/search?query=x");
    expect(searchUrl("qwant", "x")).toBe("https://www.qwant.com/?q=x");
  });

  it("unknown engine id searches on the default", () => {
    expect(searchUrl("nope", "x")).toBe("https://duckduckgo.com/?q=x");
  });

  it("every engine host is recognised by the exfil-exempt search-engine list", () => {
    // Mirror of browserPolicy.SEARCH_ENGINE_HOSTS — a search host keeps a long ?q= exempt.
    const SEARCH_ENGINE_HOSTS =
      /(^|\.)(google|duckduckgo|bing|yahoo|ecosia|brave|startpage|qwant|baidu|yandex)\.[a-z.]+$/i;
    for (const e of SEARCH_ENGINES) {
      const host = new URL(e.search("q")).hostname;
      expect(SEARCH_ENGINE_HOSTS.test(host), `${e.id} → ${host}`).toBe(true);
    }
  });
});
