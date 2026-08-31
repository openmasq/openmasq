import { app } from "electron";
import { minimalChildEnv } from "../childEnv";
import { join } from "node:path";
import { helperSpawnArgs } from "../appEntry";
import type { NodeSpawn } from "./nodeSpawn";
import { BRAND } from "@openmasq/branding";

// The controllable-browser connector's SECURITY surface, isolated so the C1/ELEC-2
// allow-list + URL gate are auditable in one place (rule 10). Pure/const — no live
// connection state (that stays in index.ts); index imports these back.

// Where @playwright/mcp writes its output files (page snapshots + logs). Ephemeral,
// OS-cleaned, never the repo. Shared by the spawn env (OPENMASQ_PWMCP_OUTPUT_DIR) and
// the result-inlining in index.ts, so they can never point at different dirs.
export function browserMcpOutputDir(): string {
  return join(app.getPath("temp"), `${BRAND.slug}-agent-browser-mcp`);
}

// @playwright/mcp is a declared dependency, so in production it spawns from its
// BUNDLED bin via Electron's own Node (ELECTRON_RUN_AS_NODE — no `npx`, no network),
// resolved by the shared nodeSpawnFor helper; falls back to npx only in a dev tree
// without the dep. It drives the ISOLATED agent-browser process over CDP.
export function playwrightMcpSpawn(cdpEndpoint: string): NodeSpawn {
  // PRIVACY: @playwright/mcp writes page snapshots (full accessibility tree of the
  // authenticated SaaS the model browses) + console logs to `<cwd>/.playwright-mcp`
  // by default — unencrypted, and in a dev tree that folder sits in the repo (risk
  // of committing real user data). Pin its output to Electron's per-app temp dir
  // (ephemeral, OS-cleaned, never the repo) instead.
  const outputDir = browserMcpOutputDir();
  // B1 (audit): run @playwright/mcp in Electron APP mode (NO ELECTRON_RUN_AS_NODE) so the
  // browser connector doesn't rely on the RunAsNode fuse. Re-enter THIS binary via the
  // OPENMASQ_PWMCP env flag — NOT an argv script: a PACKAGED Electron IGNORES an argv
  // entry and would relaunch the normal app (which quits on the single-instance lock →
  // a dead browser connector in production). Same env-branch as the agent browser
  // (process.ts spawnArgs). The child (index.ts PLAYWRIGHT_MCP_MODE branch) runs
  // @playwright/mcp PROGRAMMATICALLY over stdio (createConnection — no CLI argv to
  // mis-parse), with the CDP endpoint + output dir passed via env (not argv → not in `ps`).
  return {
    command: process.execPath,
    args: helperSpawnArgs(),
    // Allow-list, never inheritance: this process runs @playwright/mcp — third-party
    // code, with the product's most dangerous tools just below it (C1). It
    // receives ITS three variables and the bare minimum, nothing from the shell (childEnv.ts).
    env: minimalChildEnv({
      OPENMASQ_PWMCP: "1",
      PLAYWRIGHT_MCP_CDP_ENDPOINT: cdpEndpoint,
      OPENMASQ_PWMCP_OUTPUT_DIR: outputDir,
    }),
  };
}

// HARDENING (audit C1): @playwright/mcp (playwright-core coreBundle) ships ~75 tools,
// including cookie/localStorage/sessionStorage/storage-state READERS, raw network
// request + request-log readers, request routing, tracing/video capture, arbitrary-JS
// (`browser_evaluate`/`browser_run_code_unsafe`), file upload and page close. A
// prompt-injected page could steer the model into `browser_storage_state` /
// `browser_cookie_list` / `browser_network_requests` to lift the auth tokens of the
// authenticated SaaS the agent is driving, then exfiltrate them. A NAME DENYLIST is
// fail-open — every new/renamed tool a package bump adds is exposed by default (the old
// 5-name denylist missed all of the above). So we ALLOW-LIST instead: ONLY the tools
// below (ordinary page automation + read-only page inspection) are ever routed to the
// model; everything else — known-dangerous or newly-introduced — is denied by default.
// `browser_tabs` is safe: every tab is a WebContentsView in the ISOLATED agent process
// (no app-UI page, no IPC), navigations still pass `isAllowedBrowserUrl` + the child's
// per-view SSRF/scheme guards. Deliberately EXCLUDED (never add without a security
// review): browser_evaluate, browser_run_code_unsafe, browser_file_upload, browser_close,
// browser_pdf_save, browser_get_config/context_args/generate_locator (introspection),
// browser_network_request(s)/network_clear/network_state_set/route/route_list/unroute
// (raw net + header/token-bearing request logs + request interception),
// browser_cookie_*/localstorage_*/sessionstorage_*/storage_state/set_storage_state
// (auth-material read/write), browser_start_tracing/stop_tracing/*_video/video_*
// (on-disk capture of the authenticated page), browser_console_clear/resume.
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

// The agent may only navigate to real web origins (http/https) — never file://,
// chrome://, devtools://, data:, etc. (defence in depth atop @playwright/mcp's own
// file:// block). A future step adds a user-configurable domain allow-list.
export function isAllowedBrowserUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u === "about:blank") return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

// Google `/search` aggressively CAPTCHAs automated browsers (the `/sorry` page), so
// a browser-agent web search on google.com almost always fails. Transparently rewrite
// a Google web-search navigation to DuckDuckGo — the product's default engine
// (`packages/ui/src/state/searchEngines.ts` DEFAULT_SEARCH_ENGINE) — preserving the
// exact query. ⚠️ Target the MAIN `duckduckgo.com` SERP, never `html.duckduckgo.com`:
// the no-JS SERP serves a Cloudflare "Just a moment…" bot challenge to the automated
// browser (which is why this rewrite once pointed at Brave instead). If the main SERP
// ever starts challenging automation too, fall back to `search.brave.com/search?q=`.
// The URL is already UN-redacted here (real query), and the rewritten URL is
// re-checked by the SSRF guard. Non-Google/non-`/search` URLs pass through unchanged.
// `duckduckgo.com` is in `browserPolicy.SEARCH_ENGINE_HOSTS` so a long `?q=` stays
// exfil-exempt.
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
