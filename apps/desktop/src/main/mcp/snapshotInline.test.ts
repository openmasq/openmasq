import { describe, it, expect } from "vitest";
import { outputLinkBasenames, inlineOutputLinks } from "./browser/snapshotInline";

// A realistic @playwright/mcp 0.0.77 browser_navigate result: the snapshot is a
// FILE LINK, not inline content.
const NAV_RESULT = [
  "### Ran Playwright code",
  "```js",
  "await page.goto('https://html.duckduckgo.com/html/?q=actualités+Evreux+2026');",
  "```",
  "### Page",
  "- Page URL: https://html.duckduckgo.com/html/?q=actualités+Evreux+2026",
  "- Page Title: actualités Evreux 2026 at DuckDuckGo",
  "### Snapshot",
  "- [Snapshot](../../../../../../var/folders/gl/T/acme-agent-browser-mcp/page-2026-07-12T10-34-34-900Z.yml)",
  "",
].join("\n");

describe("outputLinkBasenames", () => {
  it("extracts the snapshot file basename from the markdown link", () => {
    expect(outputLinkBasenames(NAV_RESULT)).toEqual(["page-2026-07-12T10-34-34-900Z.yml"]);
  });

  it("ignores normal links and non-yml/log targets", () => {
    const t = "See [docs](https://example.com/page) and [img](../x/pic.png)";
    expect(outputLinkBasenames(t)).toEqual([]);
  });

  it("dedupes and picks up .log files too", () => {
    const t = "- [Console](a/x.log)\n- [Snapshot](b/x.log)\n- [Snapshot](c/s.yml)";
    expect(outputLinkBasenames(t)).toEqual(["x.log", "s.yml"]);
  });
});

describe("inlineOutputLinks", () => {
  it("folds the file content in as a fenced block, keyed by basename", () => {
    const tree = "- generic:\n  - link \"Évreux news 1\"\n  - link \"Évreux news 2\"";
    const { text, inlined } = inlineOutputLinks(NAV_RESULT, (b) =>
      b === "page-2026-07-12T10-34-34-900Z.yml" ? tree : null,
    );
    expect(inlined).toEqual(["page-2026-07-12T10-34-34-900Z.yml"]);
    expect(text).toContain("### Snapshot\n```yaml\n" + tree + "\n```");
    expect(text).not.toContain("[Snapshot](");
    // The rest of the result is untouched.
    expect(text).toContain("- Page Title: actualités Evreux 2026 at DuckDuckGo");
  });

  it("leaves a link untouched when its file can't be read (no regression)", () => {
    const { text, inlined } = inlineOutputLinks(NAV_RESULT, () => null);
    expect(inlined).toEqual([]);
    expect(text).toBe(NAV_RESULT);
  });

  it("uses no language fence for a .log file", () => {
    const { text } = inlineOutputLinks("- [Console](x/app.log)", () => "line1\nline2");
    expect(text).toBe("```\nline1\nline2\n```");
  });
});
