import { describe, expect, it } from "vitest";
import { isGoogleSearchHost, isSearchEngineHost } from "./searchEngines";

describe("isSearchEngineHost", () => {
  it("accepts a search engine's own host, with or without www", () => {
    for (const h of ["www.google.fr", "google.com", "duckduckgo.com", "html.duckduckgo.com", "www.bing.com", "search.brave.com"])
      expect(isSearchEngineHost(h), h).toBe(true);
  });

  it("refuses a host that only carries a search engine's NAME", () => {
    // Each of these would exempt `?q=<real value>` from the exfil scan.
    for (const h of ["bing.evil.io", "www.google.com.attacker.example", "google.attacker.example", "evilgoogle.com", "duckduckgo.com.evil.io"])
      expect(isSearchEngineHost(h), h).toBe(false);
  });

  it("tells Google's domains apart", () => {
    expect(isGoogleSearchHost("www.google.co.uk")).toBe(true);
    expect(isGoogleSearchHost("google.attacker.example")).toBe(false);
    expect(isGoogleSearchHost("duckduckgo.com")).toBe(false);
  });
});
