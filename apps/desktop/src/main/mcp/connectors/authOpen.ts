import { connectId } from "../server/connectCancel";
import { emitMcpOauthUrl } from "../server/registry";
import { safeOpenExternal } from "../../net/safeOpen";

/**
 * Open an OAuth authorize URL in the SYSTEM browser (see `mcp/CLAUDE.md` — Google SSO
 * refuses embedded webviews) AND surface it to the renderer so it can offer "Copier le
 * lien" — the login completes in whichever browser the user opens (Slack returns via the
 * relay poll, Google/Microsoft via the 127.0.0.1 loopback; both are browser-agnostic).
 *
 * The emitted URL is the SAME public authorize URL that goes to the browser: client id,
 * scopes, redirect and `state` (a PKCE challenge) — no secret, no verifier — so the
 * renderer learns nothing it couldn't already trigger. The copy affordance is purely additive.
 *
 * ⚠️ The URL comes from a REMOTE MCP server's discovery document (`authorization_endpoint`),
 * so it is attacker-chosen: this was the one path still calling `shell.openExternal` raw,
 * while `net/safeOpen.ts` claims to be the single scheme-gated choke-point for all of them
 * (audit M-3). A `file:///…` / `smb://…` / custom-scheme authorize URL therefore reached the
 * OS. It goes through `safeOpenExternal` like every other open; a refused scheme opens
 * nothing, and the flow simply never completes.
 */
export async function openAuthExternal(url: string): Promise<void> {
  const id = connectId();
  if (id) emitMcpOauthUrl(id, url);
  safeOpenExternal(url);
}
