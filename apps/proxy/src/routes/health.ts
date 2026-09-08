import { Router } from "express";
import type { ProxyConfig } from "../config/config.js";

/** Liveness, and the facts a caller wants before trusting the endpoint: the level, whether
 *  the on-device model is running (names/orgs/places detected), and what the model sees. */
export function healthRouter(config: ProxyConfig, modelOn: () => boolean): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ ok: true, level: config.level, ner: modelOn(), mode: config.mode });
  });
  return router;
}
