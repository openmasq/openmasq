import { app } from "electron";
import { minimalChildEnv } from "../childEnv";
import { join } from "node:path";
import { helperSpawnArgs } from "../appEntry";
import type { NodeSpawn } from "./nodeSpawn";
import { BRAND } from "@openmasq/branding";

// The browser connector's SECURITY surface: the tool allow-list + URL gate, auditable in one
// place (rule 10). Pure/const, no live connection state.

// Where @playwright/mcp writes its snapshots + logs: ephemeral, OS-cleaned, never the repo.
// ONE function for the spawn env and the result-inlining, so they can't diverge.
export function browserMcpOutputDir(): string {
  return join(app.getPath("temp"), `${BRAND.slug}-agent-browser-mcp`);
}

// @playwright/mcp drives the ISOLATED agent-browser process over CDP.
export function playwrightMcpSpawn(cdpEndpoint: string): NodeSpawn {
  // PRIVACY: by default @playwright/mcp writes the authenticated page's snapshots to
  // `<cwd>/.playwright-mcp`, unencrypted and, in a dev tree, inside the repo.
  const outputDir = browserMcpOutputDir();
  // Electron APP mode (NO ELECTRON_RUN_AS_NODE, so no reliance on the RunAsNode fuse),
  // re-entering THIS binary via the OPENMASQ_PWMCP env flag, NOT an argv script (a
  // PACKAGED Electron ignores an argv entry and relaunches the app). The child runs
  // @playwright/mcp PROGRAMMATICALLY over stdio; endpoint + output dir via env (not in `ps`).
  return {
    command: process.execPath,
    args: helperSpawnArgs(),
    // Allow-list, never inheritance: third-party code with the product's most dangerous
    // tools below it receives ITS three variables and the bare minimum (childEnv.ts).
    env: minimalChildEnv({
      OPENMASQ_PWMCP: "1",
      PLAYWRIGHT_MCP_CDP_ENDPOINT: cdpEndpoint,
      OPENMASQ_PWMCP_OUTPUT_DIR: outputDir,
    }),
  };
}

// @playwright/mcp ships ~75 tools, including cookie/storage READERS, raw network logs,
// request routing, tracing/video capture, arbitrary JS, file upload: a prompt-injected page
// could lift the authenticated SaaS's tokens. A NAME DENYLIST is fail-open (every tool a
// package bump adds is exposed by default), so this is an ALLOW-LIST: ONLY ordinary page
// automation + read-only inspection reach the model. `browser_tabs` is safe: every tab is a
// view in the ISOLATED agent process and navigations still pass the URL gates. Deliberately
// EXCLUDED, never add without a security review: evaluate / run_code, file_upload, close,
// pdf_save, introspection, network_* / route_*, cookie_* / *storage_* / storage_state,
// tracing / video, console_clear / resume.
export const BROWSER_TOOL_ALLOWLIST = new Set([
  // Navigation (still gated by isAllowedBrowserUrl + assertPublicUrl on the tool path).
  "browser_navigate",
  "browser_navigate_back",
  "browser_navigate_forward",
  "browser_reload",
  // Read-only page inspection (folded inline + redacted before the model sees it).
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_verify_element_visible",
  "browser_verify_list_visible",
  "browser_verify_text_visible",
  "browser_verify_value",
  // Interaction / form-filling (write-gated via @playwright/mcp's destructiveHint).
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_select_option",
  "browser_press_key",
  "browser_press_sequentially",
  "browser_hover",
  "browser_drag",
  "browser_drop",
  "browser_check",
  "browser_uncheck",
  "browser_handle_dialog",
  "browser_keydown",
  "browser_keyup",
  "browser_mouse_click_xy",
  "browser_mouse_down",
  "browser_mouse_up",
  "browser_mouse_move_xy",
  "browser_mouse_drag_xy",
  "browser_mouse_wheel",
  // Layout / timing / tabs.
  "browser_wait_for",
  "browser_resize",
  "browser_tabs",
]);

// Real web origins only (http/https), never file:// chrome:// devtools:// data:.
export function isAllowedBrowserUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u === "about:blank") return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

// Google `/search` CAPTCHAs automated browsers, so a Google web search is rewritten to
// DuckDuckGo (the product's default engine), exact query preserved. ⚠️ The MAIN SERP, never
// `html.duckduckgo.com` (its no-JS page serves a bot challenge). The rewritten URL is
// re-checked by the SSRF guard; `duckduckgo.com` is in `SEARCH_ENGINE_HOSTS` so a long
// `?q=` stays exfil-exempt.
export function rewriteSearchEngine(url: string): string {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q");
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname.toLowerCase()) && u.pathname === "/search" && q) {
      const ddg = new URL("https://duckduckgo.com/");
      ddg.searchParams.set("q", q);
      return ddg.toString();
    }
  } catch {
    // not a parseable URL — leave it for isAllowedBrowserUrl to reject
  }
  return url;
}
