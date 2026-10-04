import { describe, expect, it } from "vitest";
import { isSearchEngineHost } from "@openmasq/catalog/mcp";
import { SEARCH_ENGINES } from "./searchEngines";

// Every engine the user can pick lands on a host the exfil scan knows as a search engine;
// otherwise a long search phrase would be flagged on every search.
describe("the pickable search engines", () => {
  it("all land on an allow-listed search host", () => {
    for (const e of SEARCH_ENGINES) expect(isSearchEngineHost(new URL(e.search("x")).hostname), e.id).toBe(true);
  });
});
