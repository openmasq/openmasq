// What is left once the masked routes have had their chance — the ALLOW-list's other half.
// GET/HEAD/DELETE carry no text: relayed to the family the path names (`/v1/models`…). Any
// other method on a path no command claimed is refused with a 501: the proxy never forwards
// a body it did not mask.
import type { NextFunction, Request, Response, Router } from "express";
import { relay, type Family, type RelayDeps } from "../../lib/relay.js";

export function familyOf(req: Request): Family {
  const m = /^\/(openai|anthropic|gemini)(?=\/|$)/.exec(req.originalUrl);
  if (m) return m[1] as Family;
  if (req.path.startsWith("/v1/messages")) return "anthropic";
  if (/^\/v1(beta|alpha)?\/models\//.test(req.path) && req.path.includes(":")) return "gemini";
  if (req.path.startsWith("/v1beta/") || req.path.startsWith("/v1alpha/")) return "gemini";
  // A path that names no family (Claude Code probes `HEAD /api/hello` on its base URL) is
  // read from the headers the client cannot help sending: the audit line then names the
  // client's own upstream instead of filing everything unknown under openai.
  if (req.headers["anthropic-version"] || req.headers["x-api-key"]) return "anthropic";
  if (req.headers["x-goog-api-key"]) return "gemini";
  return "openai";
}

/**
 * A client's liveness probe on its base URL — Claude Code sends `HEAD /api/hello` before its
 * first call, with nothing in the headers to say which vendor it is (`User-Agent: Bun`). It
 * is a question about THIS endpoint, so this endpoint answers it: relayed, it reached a
 * vendor that has no such path, came back 404, and sat in the journal filed under a family
 * the request never belonged to.
 */
const PROBE_PATHS = new Set(["/api/hello"]);

export default (router: Router, deps: RelayDeps): Router => {
  router.use(async (req: Request, res: Response, _next: NextFunction) => {
    if ((req.method === "GET" || req.method === "HEAD") && PROBE_PATHS.has(req.path)) {
      const started = performance.now();
      res.status(200).json({ ok: true, app: "openmasq-proxy" });
      deps.reporter.request({
        method: req.method,
        path: req.path,
        family: "probe",
        status: 200,
        ms: performance.now() - started,
        matches: [],
        stream: false,
      });
      return;
    }
    if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
      await relay(deps, req, res, { family: familyOf(req) });
      return;
    }
    res.status(501).json({
      error: {
        type: "openmasq_proxy",
        message: `${req.method} ${req.path} is not a route the proxy knows how to mask; it is not forwarded.`,
      },
    });
  });
  return router;
};
