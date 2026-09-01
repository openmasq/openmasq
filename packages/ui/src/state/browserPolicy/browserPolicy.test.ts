import { describe, it, expect } from "vitest";
import {
  isBrowserWriteTool,
  isBrowserNavigate,
  isBrowserTool,
  isWebBrowseTool,
  isWebBrowseEntryTool,
  normalizeDomain,
  domainAllowed,
  analyzeNavExfil,
  analyzeArgExfil,
  browserNavUrl,
} from "./index";

describe("browser tool classification", () => {
  it("flags browser interaction/mutation tools as writes", () => {
    for (const t of ["browser_click", "browser_type", "browser_fill_form", "browser_press_key", "browser_file_upload"]) {
      expect(isBrowserWriteTool(`browser__${t}`)).toBe(true);
    }
  });
  it("does NOT flag navigate / read tools as writes", () => {
    for (const t of ["browser_navigate", "browser_snapshot", "browser_take_screenshot", "browser_hover", "browser_wait_for"]) {
      expect(isBrowserWriteTool(`browser__${t}`)).toBe(false);
    }
  });
  it("only matches the browser connector, not a look-alike name", () => {
    expect(isBrowserWriteTool("notion__browser_click")).toBe(false);
    expect(isBrowserWriteTool("browser_click")).toBe(false); // un-namespaced ≠ browser connector
  });
  it("read-only mode strips the ACTING tools the old 8-name denylist missed (ELEC-1)", () => {
    for (const t of [
      "browser_mouse_click_xy", "browser_mouse_down", "browser_mouse_up", "browser_mouse_drag_xy",
      "browser_keydown", "browser_keyup", "browser_press_sequentially",
      "browser_check", "browser_uncheck", "browser_drop", "browser_select_option",
    ]) {
      expect(isBrowserWriteTool(`browser__${t}`), t).toBe(true);
    }
    // Passive moves + navigation + read tools stay (not stripped).
    for (const t of [
      "browser_navigate", "browser_navigate_back", "browser_reload", "browser_snapshot",
      "browser_hover", "browser_mouse_move_xy", "browser_mouse_wheel", "browser_resize",
      "browser_wait_for", "browser_tabs", "browser_verify_text_visible",
    ]) {
      expect(isBrowserWriteTool(`browser__${t}`), t).toBe(false);
    }
  });
  it("identifies browser_navigate", () => {
    expect(isBrowserNavigate("browser__browser_navigate")).toBe(true);
    expect(isBrowserNavigate("browser__browser_click")).toBe(false);
  });
  it("browserNavUrl extracts the target URL from navigate AND tabs (ELEC-2)", () => {
    expect(browserNavUrl("browser__browser_navigate", { url: "https://x.example" })).toBe("https://x.example");
    expect(browserNavUrl("browser__browser_tabs", { action: "new", url: "http://169.254.169.254/" })).toBe(
      "http://169.254.169.254/",
    );
    // No url (a tab select/close/list) → "".
    expect(browserNavUrl("browser__browser_tabs", { action: "select", index: 1 })).toBe("");
    // A non-navigating browser tool carries no nav URL.
    expect(browserNavUrl("browser__browser_click", { url: "https://x" })).toBe("");
    // Not the integrated browser connector.
    expect(browserNavUrl("notion__search", { url: "https://x" })).toBe("");
  });
  it("isWebBrowseEntryTool matches ONLY the navigate + snapshot entry pair (any browser)", () => {
    expect(isWebBrowseEntryTool("browser__browser_navigate")).toBe(true);
    expect(isWebBrowseEntryTool("browser__browser_snapshot")).toBe(true);
    expect(isWebBrowseEntryTool("browsermcp__browser_navigate")).toBe(true);
    // Not an entry tool — pulled later via load_tools, not force-offered.
    expect(isWebBrowseEntryTool("browser__browser_click")).toBe(false);
    expect(isWebBrowseEntryTool("browser__browser_tabs")).toBe(false);
    expect(isWebBrowseEntryTool("gmail__send_email")).toBe(false);
  });

  it("isWebBrowseTool matches ANY browser (integrated + third-party BrowserMCP), not the id", () => {
    // Integrated browser.
    expect(isWebBrowseTool("browser__browser_navigate")).toBe(true);
    // Third-party browser-automation connector (the reported BrowserMCP case).
    expect(isWebBrowseTool("browsermcp__browser_navigate")).toBe(true);
    expect(isWebBrowseTool("browsermcp__browser_snapshot")).toBe(true);
    // Non-browser tools are untouched.
    expect(isWebBrowseTool("gmail__send_email")).toBe(false);
    expect(isWebBrowseTool("notion__search")).toBe(false);
  });
  it("identifies any browser-connector tool (for the recency guidance gate)", () => {
    expect(isBrowserTool("browser__browser_navigate")).toBe(true);
    expect(isBrowserTool("browser__browser_snapshot")).toBe(true);
    expect(isBrowserTool("notion__search")).toBe(false);
    expect(isBrowserTool("gmail__send_email")).toBe(false);
  });
});

describe("domain allow-list", () => {
  it("normalises entries to bare hosts", () => {
    expect(normalizeDomain("https://github.com/foo")).toBe("github.com");
    expect(normalizeDomain("  Notion.SO:443  ")).toBe("notion.so");
  });
  it("empty list = unrestricted", () => {
    expect(domainAllowed([], "https://anything.example")).toBe(true);
    expect(domainAllowed(undefined, "https://anything.example")).toBe(true);
  });
  it("allows exact host + subdomains, blocks others", () => {
    const allow = ["github.com", "notion.so"];
    expect(domainAllowed(allow, "https://github.com/x")).toBe(true);
    expect(domainAllowed(allow, "https://api.github.com/x")).toBe(true);
    expect(domainAllowed(allow, "https://evil.com/?to=github.com")).toBe(false);
    // NOT a subdomain — a suffix-only match must be rejected.
    expect(domainAllowed(allow, "https://notgithub.com")).toBe(false);
  });
  it("rejects an unparseable URL", () => {
    expect(domainAllowed(["github.com"], "not a url")).toBe(false);
  });
});

describe("navigation exfiltration heuristic", () => {
  it("passes an ordinary search URL", () => {
    const r = analyzeNavExfil("https://duckduckgo.com/?q=react+hooks");
    expect(r.suspicious).toBe(false);
    expect(r.host).toBe("duckduckgo.com");
  });
  it("does NOT flag a long plaintext search query (the false positive)", () => {
    const r = analyzeNavExfil(
      "https://www.google.com/search?q=Oslen group société activité Karl Studio",
    );
    expect(r.suspicious).toBe(false);
  });
  it("does NOT flag a plain news search — no write-confirm modal for it (reported case)", () => {
    // The gate: browser_navigate confirms only when analyzeNavExfil is suspicious.
    const r = analyzeNavExfil("https://www.google.com/search?q=actualit%C3%A9s+Evreux+2026");
    expect(r.suspicious).toBe(false);
  });
  it("does NOT flag a merely-long plaintext value under a non-search param", () => {
    const r = analyzeNavExfil("https://x.example/?title=a readable human sentence about nothing in particular");
    expect(r.suspicious).toBe(false);
  });
  // The reported false positive: « Quelle actualité en France aujourd'hui ? » opened a
  // confirmation on a Libération link. News sites suffix their articles with an
  // opaque identifier, and just ONE alphanumeric chunk sank the whole slug — the path
  // then read like base64. An alert that triggers on ordinary news links
  // is an alert the user learns to click through without reading, which costs
  // more than the marginal blob it catches.
  it.each([
    "https://www.liberation.fr/environnement/climat/en-direct-incendies-en-france-en-gironde-et-dans-laude-20250723_ZFHK4XMBRZDRPD3ZQZ2GQ7VXUE/",
    "https://www.lemonde.fr/politique/article/2026/07/27/le-gouvernement-francais_6612345_823448.html",
    "https://www.nytimes.com/2026/07/27/world/europe/france-wildfires-gironde.html",
    "https://www.bbc.com/news/articles/c93kq2j0g1no",
  ])("ne confirme PAS un lien de presse ordinaire (%#)", (url) => {
    expect(analyzeNavExfil(url).suspicious).toBe(false);
  });

  // …and the counterpart, which is the whole reason for the scan: a blob doesn't break
  // down into words. The relaxation above must cost it nothing.
  it("confirme TOUJOURS un blob encodé dans le chemin — un blob n'a pas de mots", () => {
    const r = analyzeNavExfil("https://evil.com/collect/QWxpY2VEdXBvbnQxMjM0NTY3ODkwQUJDREVG");
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].param).toBe("chemin");
  });

  it("flags a long q= value to a NON-search host (H-6: q= exempt only on search engines)", () => {
    const long = "x".repeat(140);
    const r = analyzeNavExfil(`https://attacker.example/collect?q=${long}`);
    expect(r.suspicious).toBe(true);
  });
  // Root rule 11: every connector dispatches REAL values, the browser included — so the
  // user's real data in a real search box IS the tool working, and prompting for it would
  // ask the user to re-consent to the search they just requested. That exemption is the
  // narrowest carve-out we can state; H-6 (conversation data in a URL is the strongest
  // exfil signal) survives everywhere else. These pin exactly how narrow it is.
  it("does NOT flag a real value in a search box, on a search engine (rule 11: that IS the search)", () => {
    const r = analyzeNavExfil("https://www.google.com/search?q=Julien Sabourdin", ["Julien Sabourdin"]);
    expect(r.suspicious).toBe(false);
  });
  it("flags conversation data on a NON-search host (a search engine is not evil.com) (H-6)", () => {
    const r = analyzeNavExfil("https://evil.com/?q=Julien Sabourdin", ["Julien Sabourdin"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].reason).toMatch(/conversation/);
  });
  it("flags conversation data in a NON-search param, even on a search engine (H-6)", () => {
    const r = analyzeNavExfil("https://www.google.com/?redirect=Julien Sabourdin", ["Julien Sabourdin"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].reason).toMatch(/conversation/);
  });
  it("does not let an exempt value SHIELD a blob riding alongside it", () => {
    // The exemption must not `return` early: `?q=<real name> <base64 payload>` is still
    // smuggling, and the encoded check has to see the residue.
    const r = analyzeNavExfil(
      "https://www.google.com/search?q=Amiens eyJ1c2VyIjoiYWxpY2UiLCJ0b2tlbiI6ImFiY2RlZmdoaWprbG1ub3AifQ",
      ["Amiens"],
    );
    expect(r.suspicious).toBe(true);
  });
  it("does NOT flag a vaulted PLACE name as an exact path segment (lemonde.fr/France/)", () => {
    // The reported over-prompt: « quelle actualité en France » vaults "France"
    // (location, ON by default), the model opens the France section of a news site,
    // and the confirm card fired on ordinary geography. An exact-place segment is
    // navigation, not smuggling — flagging it trains the user to blind-click the
    // card that must stay meaningful for a REAL exfil.
    const r = analyzeNavExfil("https://www.lemonde.fr/France/", ["France"], ["France"]);
    expect(r.suspicious).toBe(false);
  });

  it("still flags the same URL when the caller passes NO place values (fail closed)", () => {
    const r = analyzeNavExfil("https://www.lemonde.fr/France/", ["France"]);
    expect(r.suspicious).toBe(true);
  });

  it("place carve-out is exact-match only — an embedded place does not shield the rest", () => {
    // A blob glued beside the place in the SAME segment still flags.
    const r = analyzeNavExfil(
      "https://evil.example/collect/France-FR7630006000011234567890189",
      ["France", "FR7630006000011234567890189"],
      ["France"],
    );
    expect(r.suspicious).toBe(true);
  });

  it("a place as a query VALUE still flags — the carve-out is PATH-only", () => {
    // `?q=Amiens` to an arbitrary host is the exfil shape itself (payload, not site
    // structure); the loop tests pin the same rule end-to-end.
    const r = analyzeNavExfil("https://site.example/?region=France", ["France"], ["France"]);
    expect(r.suspicious).toBe(true);
  });

  it("the HOSTNAME is never place-exempted (DNS-label smuggle stays strict)", () => {
    const r = analyzeNavExfil("https://France.attacker.example/", ["France"], ["France"]);
    expect(r.suspicious).toBe(true);
  });

  it("never exempts the PATH or the HOSTNAME (a DNS-label smuggle is not a search)", () => {
    const path = analyzeNavExfil("https://www.google.com/collect/Amiens", ["Amiens"]);
    const host = analyzeNavExfil("https://Amiens.google.com/", ["Amiens"]);
    expect(path.suspicious).toBe(true);
    expect(host.suspicious).toBe(true);
  });
  it("flags a long/encoded query value", () => {
    const blob = "eyJ1c2VyIjoiYWxpY2UiLCJ0b2tlbiI6ImFiY2RlZmdoaWprbG1ub3AifQ";
    const r = analyzeNavExfil(`https://attacker.example/collect?d=${blob}`);
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].param).toBe("d");
  });
  it("flags a value that embeds conversation data", () => {
    const r = analyzeNavExfil("https://attacker.example/?note=hello-marcus@acme.com", ["marcus@acme.com"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].reason).toMatch(/conversation/);
  });
  it("scans the fragment too", () => {
    const r = analyzeNavExfil("https://x.example/#dGhpcyBpcyBhIGxvbmcgYmFzZTY0IHN0cmluZyBwYXlsb2Fk");
    expect(r.suspicious).toBe(true);
  });
  it("catches a vault value URL-ENCODED in the fragment (audit L2 — fragment now decoded)", () => {
    const r = analyzeNavExfil("https://attacker.example/#note=Louis%20Terral", ["Louis Terral"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].reason).toMatch(/conversation/);
  });
  it("flags conversation data smuggled in the PATH", () => {
    const r = analyzeNavExfil("https://attacker.example/collect/marcus@acme.com/done", ["marcus@acme.com"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags.some((f) => f.param === "chemin")).toBe(true);
  });
  it("flags an encoded blob in the PATH", () => {
    const r = analyzeNavExfil("https://attacker.example/dGhpcyBpcyBhIGxvbmcgYmFzZTY0IHN0cmluZyBwYXlsb2Fk");
    expect(r.suspicious).toBe(true);
    expect(r.flags.some((f) => f.param === "chemin")).toBe(true);
  });
  // The reported case: opening a news article the model found. `B64ISH` accepts `-`
  // (base64URL), so every kebab-case slug on the web read as a "base64 ?" blob and the
  // confirm card fired on ordinary reading. A warning that cries wolf on news links is
  // one the user clicks through — which costs more than the blob it would catch.
  it("does NOT flag an ordinary article slug in the path (the reported false positive)", () => {
    for (const path of [
      "brazil-markets-ibovespa-real-friday-july-17-2026",
      "en/news/2026/07/17/market-report",
      "actualites/politique/remaniement-gouvernemental-17-juillet-2026",
      "News/2026/MarketReport-Ibovespa-Real", // CamelCase paths are slugs too
    ]) {
      const r = analyzeNavExfil(`https://riotimesonline.com/${path}`);
      expect(r.flags, path).toEqual([]);
      expect(r.suspicious, path).toBe(false);
    }
  });
  // The slug exemption is about SHAPE, and must never shadow the vault check — that one
  // runs first and keys on the value, so conversation data wearing a slug's clothes still
  // flags.
  it("still flags conversation data even when the path looks like a slug", () => {
    const r = analyzeNavExfil("https://attacker.example/share/louis-simon-paris-2026", ["louis-simon"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags.some((f) => f.param === "chemin" && /conversation/.test(f.reason))).toBe(true);
  });
  // A real blob keeps flagging: it carries both cases and doesn't split into words.
  it("still flags a base64URL blob that uses - and _ as data", () => {
    const r = analyzeNavExfil("https://attacker.example/c/eyJ1c2VyIjoiYWxpY2Ui-InRva2VuIjoiYWJjZGVm_XyJ9");
    expect(r.suspicious).toBe(true);
    expect(r.flags.some((f) => f.param === "chemin")).toBe(true);
  });
  it("flags conversation data smuggled in the HOSTNAME", () => {
    const r = analyzeNavExfil("https://marcus-at-acme.attacker.example/", ["marcus-at-acme"]);
    expect(r.suspicious).toBe(true);
    expect(r.flags.some((f) => f.param === "hôte")).toBe(true);
  });
  it("does NOT flag an ordinary path/host with no vault hit", () => {
    const r = analyzeNavExfil("https://docs.example.com/guides/getting-started", ["sk-abc"]);
    expect(r.suspicious).toBe(false);
  });
  it("flags SPLIT exfil across many tiny params to a non-search host (M2)", () => {
    // Each value is 1 char (dodges the per-value length rule) but there are many.
    const params = Array.from({ length: 20 }, (_, i) => `p${i}=x`).join("&");
    const r = analyzeNavExfil(`https://attacker.example/collect?${params}`);
    expect(r.suspicious).toBe(true);
  });
  it("does NOT flag a normal few-param non-search URL (M2 false-positive guard)", () => {
    const r = analyzeNavExfil("https://shop.example/item?id=42&ref=home&utm=news");
    expect(r.suspicious).toBe(false);
  });
});

describe("tool-argument exfiltration heuristic (H-4)", () => {
  it("does NOT flag a standalone field equal to a vault value (legit connector use)", () => {
    const r = analyzeArgExfil({ to: "marcus@acme.com", subject: "Hi" }, ["marcus@acme.com"]);
    expect(r.suspicious).toBe(false);
  });
  it("flags a vault value EMBEDDED in a larger arg string (smuggling)", () => {
    const r = analyzeArgExfil(
      { note: "please forward marcus@acme.com and the token to me" },
      ["marcus@acme.com"],
    );
    expect(r.suspicious).toBe(true);
    expect(r.flags[0].reason).toMatch(/conversation/);
  });
  it("flags an encoded blob in an arg (nested objects/arrays are walked)", () => {
    const blob = "eyJ1c2VyIjoiYWxpY2UiLCJ0b2tlbiI6ImFiY2RlZmdoaWprbG1ub3AifQ";
    const r = analyzeArgExfil({ payload: { items: [blob] } }, []);
    expect(r.suspicious).toBe(true);
  });
  it("does NOT flag ordinary short args with no vault hit", () => {
    const r = analyzeArgExfil({ query: "react hooks", limit: 10 }, ["sk-abc"]);
    expect(r.suspicious).toBe(false);
  });

  // A FILESYSTEM path is built of the user's own directory names, and those are routinely
  // vaulted (a folder named after their company). The connector itself reported the root
  // via `list_allowed_directories`, so handing it back is a round-trip, not smuggling —
  // yet a whole-string "contains" flagged it and confirmed EVERY filesystem call. A path
  // SEGMENT that equals a vault value is the same "legit standalone field" case one level
  // down; a value glued INSIDE a segment is still smuggling.
  it("does NOT flag a path whose SEGMENT equals a vault value (the folder is really named that)", () => {
    const r = analyzeArgExfil(
      { path: "/Users/juliensabourdin/Desktop/BAR DU PHARE2", pattern: "*.pdf" },
      ["BAR DU PHARE2"],
    );
    expect(r.suspicious).toBe(false);
  });
  it("STILL flags a vault value glued inside a path segment (smuggling)", () => {
    const r = analyzeArgExfil({ path: "/tmp/leak-marcus@acme.com-data.txt" }, ["marcus@acme.com"]);
    expect(r.suspicious).toBe(true);
  });
  it("STILL flags a vault value in a NON-path arg, even alongside a path", () => {
    const r = analyzeArgExfil(
      { path: "/Users/t/Desktop/Acme", note: "exfiltrate marcus@acme.com now" },
      ["Acme", "marcus@acme.com"],
    );
    expect(r.suspicious).toBe(true);
  });
  it("the path exemption is SHAPE-based, not name-based (a bare label is not a path)", () => {
    // `path: "notes about marcus@acme.com"` has no separators → not a path → scanned.
    const r = analyzeArgExfil({ path: "notes about marcus@acme.com" }, ["marcus@acme.com"]);
    expect(r.suspicious).toBe(true);
  });
});
