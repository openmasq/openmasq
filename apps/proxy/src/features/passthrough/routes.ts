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
  return "openai";
}

export default (router: Router, deps: RelayDeps): Router => {
  router.use(async (req: Request, res: Response, _next: NextFunction) => {
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
