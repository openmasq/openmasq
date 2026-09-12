// Per-request redaction state on `res.locals`: the vault (fresh, or the one named by
// `x-openmasq-session`), the substitution mode, and the matches the commands accumulate for
// the audit line. Read once here, so no command re-parses a header.
//
// ⚠️ With `--mcp` the DEFAULT changes: a request that names no session joins one shared
// process vault instead of getting a fresh one. It has to. The agent's tool calls and its
// model calls arrive on two different channels, and a fake minted on one must be the same
// fake on the other or the reply cannot be restored. One proxy process = one agent = one
// vault; `x-openmasq-session` still splits it for a caller that wants several.
import type { NextFunction, Request, Response } from "express";
import type { ProxyConfig } from "../../config/config.js";
import type { Locals } from "../../lib/relay.js";
import { sessionIdFrom, VaultSessions } from "../../lib/sessions.js";

/** The id the shared process vault lives under when NO client was wrapped. Not a header value: it is chosen here, so a
 *  caller cannot claim it by accident (`sessionIdFrom` returns the header verbatim). */
const SHARED_SESSION = "\u0000proxy";

/**
 * `ownSession` is the wrapped client's own session — and it is what an UNNAMED request falls
 * back to, which is the whole of « one agent, one vault ». That client's model calls arrive
 * under `/s/<session>` (the base URL it was handed), while its tool calls arrive at `/mcp`,
 * which names nothing: a generic shared id made those two channels two DIFFERENT vaults, so a
 * value masked in a tool result got a fake the reply could not restore and the user read the
 * fake. Falling back to the client's own session puts both on one vault, and a SECOND client
 * naming its own session still gets its own (`session.test.ts`).
 */
export function sessionMiddleware(config: ProxyConfig, ownSession?: string) {
  const sessions = new VaultSessions(config.sessionTtlMs);
  const unnamed = ownSession || SHARED_SESSION;
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers["x-openmasq-mode"];
    const mode = header === "token" ? "token" : header === "fake" ? "fake" : config.mode;
    // Three ways to name a session, most explicit first. The PATH is what makes several
    // wrapped clients work at once: a tool lets us set its base URL and nothing else — no
    // header — so the session travels in the URL the wrapper hands it.
    const named = sessionIdFrom(req.params.sid) ?? sessionIdFrom(req.headers["x-openmasq-session"]);
    const { vault, key } = sessions.get(named ?? (config.mcp ? unnamed : undefined));
    const locals: Locals = { vault, key, mode, matches: [], ...(named ? { session: named } : {}) };
    Object.assign(res.locals, locals);
    next();
  };
}
