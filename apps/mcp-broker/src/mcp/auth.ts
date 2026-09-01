import type { NextFunction, Request, Response } from "express";
import { brokerUrl } from "../config.js";
import { store, type BrokerToken } from "../oauth/store.js";

export interface AuthedRequest extends Request {
  broker?: BrokerToken;
}

/**
 * Require a valid broker bearer token whose platform matches the URL. On failure,
 * answer 401 with an RFC 9728 `WWW-Authenticate` pointing at the resource metadata
 * so the MCP client can discover the broker AS and start the OAuth flow.
 */
export function requireBrokerAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const platformId = String(req.params.platform);
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const rec = bearer ? store.resolveToken(bearer) : undefined;
  if (!rec || rec.platform !== platformId) {
    const meta = brokerUrl(`/${platformId}/.well-known/oauth-protected-resource`);
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${meta}"`);
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  req.broker = rec;
  next();
}
