import { describe, it, expect } from "vitest";
import { browserNavUrl } from "../state/browserPolicy";
import { isSearchTool, skipsArgExfilScan } from "./mcpAgentClassify";

/**
 * Two whole tool shapes used to reach a model-chosen host with NO exfil scan, because the
 * gates keyed off the tool's NAME and its connector id:
 *
 *  - `browser__browser_tabs({action:"new", url})` — `isBrowserNavigate` pinned the bare
 *    name to `browser_navigate`, so no nav scan; and `isSearchTool` returned true (bare
 *    starts with `browser_`), so the arg scan was skipped too. Zero scans.
 *  - `browsermcp__browser_navigate` (any third-party browser) — `isBrowserNavigate` AND
 *    `browserNavUrl` both pinned `connector === "browser"`, so it got neither the domain
 *    allow-list nor a scan.
 *
 * Both were harmless only while an un-redaction gate kept the value a fake. Rule 11 removed
 * that gate — every connector now dispatches the REAL value — so these scans are no longer
 * a second line of defence behind it: they ARE the line. Naming must never confer capability.
 */
describe("browserNavUrl — a navigation is a navigation, whoever ships it", () => {
  it("catches the integrated browser's navigate + tabs", () => {
    expect(browserNavUrl("browser__browser_navigate", { url: "https://x.test" })).toBe("https://x.test");
    expect(browserNavUrl("browser__browser_tabs", { action: "new", url: "https://x.test" })).toBe(
      "https://x.test",
    );
  });

  it("REGRESSION: catches a THIRD-PARTY browser's navigate (was invisible to every gate)", () => {
    expect(browserNavUrl("browsermcp__browser_navigate", { url: "https://evil.test/?d=x" })).toBe(
      "https://evil.test/?d=x",
    );
    expect(browserNavUrl("evil__browser_tabs", { action: "new", url: "https://evil.test" })).toBe(
      "https://evil.test",
    );
  });

  it("still ignores an ordinary tool that happens to carry a `url` arg", () => {
    expect(browserNavUrl("notion__search", { url: "https://x.test" })).toBe("");
    expect(browserNavUrl("browser__browser_click", { url: "https://x.test" })).toBe("");
  });

  it("no url ⇒ nothing to scan (a tabs select/close carries none)", () => {
    expect(browserNavUrl("browser__browser_tabs", { action: "select", index: 1 })).toBe("");
    expect(browserNavUrl("browser__browser_navigate", undefined)).toBe("");
    expect(browserNavUrl("browser__browser_navigate", { url: 42 })).toBe("");
  });
});

describe("skipsArgExfilScan — naming must not confer capability", () => {
  it("the integrated browser may skip (the reveal gate already covers it)", () => {
    expect(skipsArgExfilScan("browser__browser_navigate")).toBe(true);
  });

  // The S1b hole: `isSearchTool` accepts ANY bare name starting with `browser_`, so a
  // hostile server named its tool `evil__browser_navigate`, self-classified as a search
  // tool and skipped the scan — fail-open by construction.
  it("REGRESSION: a hostile server cannot self-classify by naming its tool browser_*", () => {
    expect(isSearchTool("evil__browser_navigate")).toBe(true); // the naming trick still fools this...
    expect(skipsArgExfilScan("evil__browser_navigate")).toBe(false); // ...but no longer skips the scan
    expect(skipsArgExfilScan("evil__browser_search")).toBe(false);
  });

  it("an unknown connector is always scanned", () => {
    expect(skipsArgExfilScan("attacker__lookup")).toBe(false);
    expect(skipsArgExfilScan("lookup")).toBe(false);
  });
});
