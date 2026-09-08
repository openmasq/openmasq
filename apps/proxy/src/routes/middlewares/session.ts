// Per-request redaction state on `res.locals`: the vault (fresh, or the one named by
// `x-openmasq-session`), the substitution mode, and the matches the commands accumulate for
// the audit line. Read once here, so no command re-parses a header.
import type { NextFunction, Request, Response } from "express";
import type { ProxyConfig } from "../../config/config.js";
import type { Locals } from "../../lib/relay.js";
import { sessionIdFrom, VaultSessions } from "../../lib/sessions.js";

export function sessionMiddleware(config: ProxyConfig) {
  const sessions = new VaultSessions(config.sessionTtlMs);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers["x-openmasq-mode"];
    const mode = header === "token" ? "token" : header === "fake" ? "fake" : config.mode;
    const { vault, key } = sessions.get(sessionIdFrom(req.headers["x-openmasq-session"]));
    const locals: Locals = { vault, key, mode, matches: [] };
    Object.assign(res.locals, locals);
    next();
  };
}
