import { shell } from "electron";

/**
 * Only ever hand http(s)/mailto URLs to the OS (audit M-3): a model reply, an injected page,
 * OR a malicious remote MCP server's OAuth `authorization_endpoint` can emit `file:///…`,
 * `smb://…`, or a custom-protocol URL, and `shell.openExternal` on an attacker-chosen scheme
 * is a known abuse/RCE vector. Returns true iff the URL was actually opened.
 *
 * Shared by the window's `setWindowOpenHandler` / context menu (index.ts) AND the MCP OAuth
 * flow (mcp/index.ts) so every path to `shell.openExternal` is scheme-gated in one place.
 */
export function safeOpenExternal(url: string): boolean {
  let scheme = "";
  try {
    scheme = new URL(url).protocol;
  } catch {
    return false; // not a valid URL
  }
  if (scheme === "https:" || scheme === "http:" || scheme === "mailto:") {
    void shell.openExternal(url);
    return true;
  }
  console.warn(`[security] refused shell.openExternal for scheme "${scheme}"`);
  return false;
}
