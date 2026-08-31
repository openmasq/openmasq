/**
 * The renderer's CSP, WIDENED to the self-hosted stack's origins — at load time, by
 * main, and only in the `custom` environment.
 *
 * `index.html`'s CSP is a STATIC `<meta>` tag (`src/renderer/index.html`): it
 * only allows `'self'`, the baked Supabase and `https://*.<brand domain>`. A
 * meta-CSP cannot be LOOSENED by a header (both apply, the stricter one wins),
 * so a stack on another domain would be blocked even if accepted by main. The only
 * honest way to widen it is to serve an `index.html` whose `connect-src` carries the
 * declared origins IN ADDITION — exactly those, never a wildcard (`customCspOrigins`).
 *
 * Mechanism: we intercept the default session's `file:` scheme (`protocol.handle`),
 * we rewrite ONLY the renderer's `index.html` file, and everything else goes back to the
 * native handler (`net.fetch` + `bypassCustomProtocolHandlers`). The renderer's origin
 * doesn't change, nor does the preload's. Must run after `whenReady`, before `loadFile`.
 */
import { protocol, net } from "electron";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { customCspOrigins, patchCspConnectSrc, type CustomStack } from "../environments/customStack";
import type { EnvName } from "../environments";
import { readEnvPointerFull } from "./environment";

export function installCustomStackCsp(stack: CustomStack, rendererIndexHtml: string): void {
  const origins = customCspOrigins(stack);
  if (origins.length === 0) return;
  const indexUrl = pathToFileURL(rendererIndexHtml).href;
  protocol.handle("file", async (request) => {
    // Compared WITHOUT the query or the fragment: `loadFile` can add one, the file is the same.
    const url = request.url.split(/[?#]/, 1)[0];
    if (url !== indexUrl) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    const html = await readFile(rendererIndexHtml, "utf8");
    return new Response(patchCspConnectSrc(html, origins), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

/** The wiring from `index.ts`, in one line: nothing to do outside the `custom`
 *  environment, and nothing either if the pointer no longer carries a valid stack
 *  (`environment.ts` re-reads and REVALIDATES — a stack tampered with on disk widens nothing). */
export function installCustomStackCspFor(profile: { env: EnvName; baseUserData: string }, rendererIndexHtml: string): void {
  if (profile.env !== "custom") return;
  const { custom } = readEnvPointerFull(profile.baseUserData);
  if (custom) installCustomStackCsp(custom, rendererIndexHtml);
}
