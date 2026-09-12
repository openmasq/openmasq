// The proxy binds loopback, and loopback is where its callers are. This middleware makes the
// SERVER say so too, on every route, because binding is not the same promise as answering.
//
// A browser resolves the name IT was given, not the address it reaches: a page on
// `attacker.example` whose DNS answers `127.0.0.1` talks to this process believing it is the
// same origin, and reads every reply. The address filter cannot see that — the packet really
// does arrive on loopback — but the `Host` line carries the name the browser used, and a name
// that is not loopback is a caller that did not mean to reach US.
//
// Two checks, both fail-CLOSED:
//   • `Host` must be a loopback name (`127.0.0.1`, `localhost`, `[::1]`) on our own port, or
//     the address we were bound to. No `Host` at all is refused too — every HTTP/1.1 client
//     sends one, so an absent line is not a client we need to serve.
//   • `Origin`, when present, must be one of those same loopback origins. A CLI sends none;
//     a browser sends it on every cross-origin call, which is exactly the caller to refuse.
//
// A refusal is a 403 with no body: there is nothing here to describe to something that
// reached us under another name.
import type { NextFunction, Request, Response } from "express";

/** The host NAMES a caller may legitimately use to reach a loopback-bound server. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0:0:0:0:0:0:0:1"]);

/** `host:port` → the host alone, keeping an IPv6 literal's brackets (`[::1]:8787` → `[::1]`). */
export function hostOf(value: string): string {
  const v = value.trim().toLowerCase();
  if (v.startsWith("[")) return v.slice(0, v.indexOf("]") + 1) || v;
  const colon = v.lastIndexOf(":");
  return colon > 0 ? v.slice(0, colon) : v;
}

/** Is `value` (a `Host` line or a URL's authority) one of the loopback names? */
export const isLoopbackHost = (value: string | undefined, bound: string): boolean => {
  if (!value) return false;
  const host = hostOf(value);
  return LOOPBACK_HOSTS.has(host) || host === bound.toLowerCase();
};

/** Is `origin` a loopback ORIGIN — `http://127.0.0.1:8787`, `http://localhost`? */
export function isLoopbackOrigin(origin: string, bound: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return isLoopbackHost(u.host, bound);
  } catch {
    return false;
  }
}

/**
 * Refuse a request that did not address this process by a loopback name. Mounted FIRST, so it
 * covers every route — the relay, `/mcp`, `/console`, `/healthz` alike.
 */
export function loopbackOnly(bound: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isLoopbackHost(req.headers.host, bound)) {
      res.status(403).end();
      return;
    }
    const origin = req.headers.origin;
    // `null` is what a sandboxed/file origin sends — not one of ours either.
    if (typeof origin === "string" && origin !== "" && !isLoopbackOrigin(origin, bound)) {
      res.status(403).end();
      return;
    }
    next();
  };
}
