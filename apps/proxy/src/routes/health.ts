import { Router } from "express";
import type { ProxyConfig } from "../config/config.js";

/**
 * Liveness, and the facts a caller wants before trusting the endpoint: the level, whether
 * the on-device model is running (names/orgs/places detected), and what the model sees.
 *
 * It also NAMES ITSELF. A second wrapper looks here before joining an already-running proxy
 * (`lib/attach.ts`), and something else listening on 8787 is not a thing to hand an API key
 * to — so the answer has to be recognisable, not merely a 200.
 */
export function healthRouter(config: ProxyConfig, modelOn: () => boolean, version = "dev"): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({
      ok: true,
      app: "openmasq-proxy",
      version,
      level: config.level,
      ner: modelOn(),
      mode: config.mode,
    });
  });
  return router;
}
