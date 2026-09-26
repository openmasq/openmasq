// `/blocked/…` — the dead end a wrapped client's OTHER egress is pointed at (`features/vibe`):
// a provider whose upstream the proxy has no family for, a text-to-speech or teleport
// endpoint that would carry the restored — REAL — text. Every method is refused here, never
// relayed, and the refusal says which door it was. A WebSocket upgrade (voice transcription)
// has no `upgrade` listener to hijack it, so it arrives here like any GET and gets the 403.
import type { Request, Response, Router } from "express";
import type { RelayDeps } from "../../lib/relay.js";

export const BLOCKED_PREFIX = "/blocked";

export default (router: Router, deps: RelayDeps): Router => {
  router.use((req: Request, res: Response) => {
    const started = performance.now();
    const door = req.path.split("/").filter(Boolean).slice(0, 2).join("/") || "unknown";
    res.status(403).json({
      error: {
        type: "openmasq_proxy",
        message:
          `blocked by openmasq-proxy: ${door} would leave the machine without passing through ` +
          "the mask, so it is switched off for this run.",
      },
    });
    deps.reporter.request({
      method: req.method,
      path: `${BLOCKED_PREFIX}/${door}`,
      family: "blocked",
      status: 403,
      ms: performance.now() - started,
      matches: [],
      stream: false,
    });
  });
  return router;
};
