import { shell } from "electron";
import { connectId } from "../server/connectCancel";
import { emitMcpOauthUrl } from "../server/registry";

/**
 * Open an OAuth authorize URL in the SYSTEM browser (see `mcp/CLAUDE.md` — Google SSO
 * refuses embedded webviews) AND surface it to the renderer so it can offer "Copier le
 * lien" — the login completes in whichever browser the user opens (Slack returns via the
 * relay poll, Google/Microsoft via the 127.0.0.1 loopback; both are browser-agnostic).
 *
 * The emitted URL is the SAME public authorize URL that goes to the browser: client id,
 * scopes, redirect and `state` (a PKCE challenge) — no secret, no verifier — so the
 * renderer learns nothing it couldn't already trigger. Keeping `shell.openExternal` here
 * preserves the existing behaviour; the copy affordance is purely additive.
 */
export async function openAuthExternal(url: string): Promise<void> {
  const id = connectId();
  if (id) emitMcpOauthUrl(id, url);
  await shell.openExternal(url);
}
