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

/** The id the shared process vault lives under. Not a header value: it is chosen here, so a
 *  caller cannot claim it by accident (`sessionIdFrom` returns the header verbatim). */
const SHARED_SESSION = "\u0000proxy";

export function sessionMiddleware(config: ProxyConfig) {
  const sessions = new VaultSessions(config.sessionTtlMs);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers["x-openmasq-mode"];
    const mode = header === "token" ? "token" : header === "fake" ? "fake" : config.mode;
    const named = sessionIdFrom(req.headers["x-openmasq-session"]);
    const { vault, key } = sessions.get(named ?? (config.mcp ? SHARED_SESSION : undefined));
    const locals: Locals = { vault, key, mode, matches: [] };
    Object.assign(res.locals, locals);
    next();
  };
}
