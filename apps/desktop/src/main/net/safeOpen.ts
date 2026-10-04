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

/**
 * What the OS may OPEN in its default app: documents, images, media — an ALLOW-list of
 * extensions. Anything else (`.exe`, `.bat`, `.hta`, `.command`, `.terminal`, `.app`, `.html`,
 * `.svg`, a macro-enabled `.docm`…) is REVEALED in the file manager instead: `openPath` on
 * an executable RUNS it, and the name comes from an attachment or a model-written file. The
 * old binary formats (`.doc`, `.xls`, `.ppt`) stay openable: the Office app's own macro
 * policy is what governs them, as for any file the user opens.
 */
const OPENABLE = new Set([
  "pdf", "txt", "md", "csv", "tsv", "json", "xml", "log", "rtf",
  "doc", "docx", "odt", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "pages", "numbers", "key",
  "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff",
  "mp3", "wav", "m4a", "ogg", "mp4", "mov", "webm",
]);

export function isOpenableFile(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && OPENABLE.has(base.slice(dot + 1).toLowerCase());
}

/** Open a local file in its default app when its type is openable, else reveal it in the
 *  file manager. Returns what was done; throws the OS's own error on a failed open. */
export async function safeOpenPath(path: string): Promise<"opened" | "revealed"> {
  if (!isOpenableFile(path)) {
    shell.showItemInFolder(path);
    return "revealed";
  }
  const err = await shell.openPath(path);
  if (err) throw new Error(err);
  return "opened";
}
