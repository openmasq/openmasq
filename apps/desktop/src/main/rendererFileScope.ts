/**
 * The default session's `file:` scheme serves the RENDERER'S OWN FILES and nothing else.
 *
 * The packaged renderer is a `file://` page, and Electron grants `file://` pages extra
 * privileges (the `GrantFileProtocolExtraPrivileges` fuse, which the module scripts and
 * workers of the build rely on): with the stock handler, script running in the renderer
 * could `fetch("file:///…")` ANY file the user can read, around the `files:read` gate
 * (`ipc/readGate.ts`). The renderer is untrusted for security decisions (root rule 7), so
 * main intercepts the scheme (`protocol.handle`) and answers 404 for every path outside
 * the renderer directory (`out/renderer`). Inside it, the request goes back to the native
 * handler (`net.fetch` + `bypassCustomProtocolHandlers`); the renderer's origin does not
 * change. The optional `patchIndex` rewrites ONLY `index.html` (the custom stack's CSP,
 * `customStackCsp.ts`). Must run after `whenReady`, before `loadFile`.
 *
 * Scope: the DEFAULT session only. The PDF window and the login partitions have their own
 * sessions and their own posture (`pdf/`, `browserSession.ts`).
 */
import { protocol, net } from "electron";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The file a `file:` URL names, or null when the URL is not a plain local file URL. */
function filePathOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "file:" || (u.host !== "" && u.host !== "localhost")) return null;
  u.search = "";
  u.hash = "";
  try {
    // `fileURLToPath` decodes percent-escapes and REFUSES an encoded separator; `resolve`
    // folds `..` — the comparison below sees the path the native handler would open.
    return resolve(fileURLToPath(u));
  } catch {
    return null;
  }
}

/** Does `url` name a file INSIDE `rendererDir`? Pure on its inputs (`rendererFileScope.test.ts`). */
export function isRendererFile(url: string, rendererDir: string, platform: NodeJS.Platform = process.platform): boolean {
  const path = filePathOf(url);
  if (!path) return false;
  const root = resolve(rendererDir);
  const fold = (s: string) => (platform === "win32" ? s.toLowerCase() : s);
  return fold(path) === fold(root) || fold(path).startsWith(fold(root + sep));
}

/** Is `url` exactly `indexHtml` (query and fragment ignored)? */
function isIndexFile(url: string, indexHtml: string, platform: NodeJS.Platform = process.platform): boolean {
  const path = filePathOf(url);
  if (!path) return false;
  const want = resolve(indexHtml);
  return platform === "win32" ? path.toLowerCase() === want.toLowerCase() : path === want;
}

export function installRendererFileScope(rendererIndexHtml: string, patchIndex: ((html: string) => string) | null): void {
  const rendererDir = dirname(rendererIndexHtml);
  protocol.handle("file", async (request) => {
    if (!isRendererFile(request.url, rendererDir)) return new Response(null, { status: 404 });
    if (patchIndex && isIndexFile(request.url, rendererIndexHtml)) {
      const html = await readFile(rendererIndexHtml, "utf8");
      return new Response(patchIndex(html), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
}
