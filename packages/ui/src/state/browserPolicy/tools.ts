// ── Agent-browser security policy (pure, unit-testable) ──────────────────────
// Prompt-injection hardening for the controllable browser. A malicious page can
// influence the model; these are damage-limiters, NOT an immunity claim:
//  • READ-ONLY mode strips the interaction/mutation tools (no click/type/submit),
//    so an injected page can't make the model act in an authenticated SaaS;
//  • a DOMAIN ALLOW-LIST bounds where the model may navigate;
//  • the nav EXFIL analyzer flags data-looking query strings in the write-confirm
//    dialog before the user approves a navigation.
// Tool names are namespaced `${connector}__${bare}` (connector "browser").

const BROWSER = "browser";

/** Browser tools that stay available in READ-ONLY mode: navigation + read-only page
 *  inspection + passive pointer/viewport moves. This is an ALLOW-LIST of readers (audit
 *  ELEC-1): `isBrowserWriteTool` treats EVERYTHING ELSE the connector exposes as a
 *  "write" and strips it in read-only mode — so a @playwright/mcp bump that adds a new
 *  ACTING primitive (a new click/type/mouse variant) is stripped by DEFAULT instead of
 *  silently widening read-only mode, the way the old 8-name denylist did (it missed
 *  `mouse_click_xy`/`keydown`/`press_sequentially`/`check`/`uncheck`/`drop`…). Mirrors the
 *  non-acting subset of the main-process `BROWSER_TOOL_ALLOWLIST`. Passive moves
 *  (hover / mouse_move_xy / mouse_wheel / resize) are kept — they don't act on SaaS state. */
const BROWSER_READ_TOOLS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_navigate_forward",
  "browser_reload",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_verify_element_visible",
  "browser_verify_list_visible",
  "browser_verify_text_visible",
  "browser_verify_value",
  "browser_wait_for",
  "browser_resize",
  "browser_hover",
  "browser_mouse_move_xy",
  "browser_mouse_wheel",
  "browser_tabs",
]);

function split(name: string): { connector: string; bare: string } {
  const i = name.indexOf("__");
  return i > 0 ? { connector: name.slice(0, i), bare: name.slice(i + 2) } : { connector: name, bare: name };
}

/** Any tool belonging to the INTEGRATED controllable-browser connector (namespaced
 *  `browser__…`). Drives the browser-SPECIFIC bits (the split-panel auto-open, the
 *  SSRF/denylist hardening) — those only apply to OUR Playwright-driven browser. */
export function isBrowserTool(toolName: string): boolean {
  return split(toolName).connector === BROWSER;
}

/** Any WEB-BROWSING tool — the integrated browser OR a THIRD-PARTY browser-automation
 *  connector (e.g. "BrowserMCP", `browsermcp__browser_navigate`). Detected by the
 *  `browser_*` bare-name convention BOTH use, so a third-party browser gets the SAME
 *  redaction/reveal treatment (the 🌐 reveal gate + `BROWSER_CLEAR` on its results) as
 *  the integrated one — otherwise a company/place typed by the user stays redacted and
 *  the model searches a FAKE name (degraded results, no reveal offer). Purely a
 *  redaction/reveal signal — NOT the integrated-browser hardening (that stays keyed on
 *  the exact `browser` id via {@link isBrowserTool}). */
export function isWebBrowseTool(toolName: string): boolean {
  return split(toolName).bare.startsWith("browser_");
}

/** The minimal ENTRY set of a web browser: navigate to a URL + read the page. Enough to
 *  START a web task; the rest (click/type/tabs) is pulled on demand via `load_tools`.
 *  Force-offered on a web-intent query so a mid-tier model can browse without first
 *  chaining `load_tools`. Matches the integrated browser AND a third-party one (bare-name
 *  convention, like {@link isWebBrowseTool}). */
const WEB_BROWSE_ENTRY = new Set(["browser_navigate", "browser_snapshot"]);
export function isWebBrowseEntryTool(toolName: string): boolean {
  return WEB_BROWSE_ENTRY.has(split(toolName).bare);
}

export function isBrowserWriteTool(toolName: string): boolean {
  const { connector, bare } = split(toolName);
  // Allow-list inverse: any integrated-browser tool that is NOT a known reader/navigation
  // tool is a "write" (stripped in read-only mode). Fail-closed against new input tools.
  return connector === BROWSER && !BROWSER_READ_TOOLS.has(bare);
}

export function isBrowserNavigate(toolName: string): boolean {
  const { connector, bare } = split(toolName);
  return connector === BROWSER && bare === "browser_navigate";
}

/** A browser tool that can trigger a NAVIGATION to a model-supplied URL — `browser_navigate`
 *  AND `browser_tabs` (its `action:"new"` opens a tab AT `args.url`). Both must go through
 *  the same domain-allow-list + SSRF/scheme gate + nav-exfil scan (audit ELEC-2): gating
 *  only `browser_navigate` let the model reach an off-allow-list / internal host by opening
 *  a tab instead. Returns the target URL (from `args.url`) or "" when there is none (a
 *  `browser_tabs` select/close/list carries no url).
 *
 *  ⚠️ Matched on the BARE name across EVERY connector: pinning `connector === "browser"`
 *  let a third-party browser (`browsermcp__browser_navigate`) reach a model-chosen host
 *  with no domain gate and no exfil scan. A navigation is a navigation whoever ships it.
 *  The bare-name pin stays, so `notion__search`'s unrelated `url` isn't swept in. */
export function browserNavUrl(toolName: string, args: Record<string, unknown> | undefined): string {
  const { bare } = split(toolName);
  if (bare !== "browser_navigate" && bare !== "browser_tabs") return "";
  const url = args?.url;
  return typeof url === "string" ? url : "";
}

/** Normalise a user-entered allow-list entry to a bare host (drop scheme/path/port). */
export function normalizeDomain(entry: string): string {
  const d = entry.trim().toLowerCase();
  if (!d) return "";
  return d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}

/** Host allowed if it equals or is a subdomain of any allow-list entry. An EMPTY
 *  list = unrestricted (the feature is opt-in). An unparseable URL = not allowed. */
export function domainAllowed(allow: string[] | undefined, url: string): boolean {
  const list = (allow ?? []).map(normalizeDomain).filter(Boolean);
  if (list.length === 0) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return list.some((d) => host === d || host.endsWith("." + d));
}
