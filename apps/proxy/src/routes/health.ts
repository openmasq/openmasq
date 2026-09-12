import { Router } from "express";
import type { ProxyConfig } from "../config/config.js";
import { activeCategories } from "../features/console/events.js";
import { disabledKindsFor } from "../lib/masker.js";

/**
 * Liveness, and the facts a caller wants before trusting the endpoint: the level, whether
 * the on-device model is running (names/orgs/places detected), what the model sees, and
 * whether a live view is served.
 *
 * It also NAMES ITSELF. A second wrapper looks here before joining an already-running proxy
 * (`lib/attach.ts`), and something else listening on 8787 is not a thing to hand an API key
 * to — so the answer has to be recognisable, not merely a 200.
 */
export function healthRouter(
  config: ProxyConfig,
  modelOn: () => boolean,
  version = "dev",
  consoleOn = false,
): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({
      ok: true,
      app: "openmasq-proxy",
      version,
      level: config.level,
      // The EFFECTIVE list, level arithmetic and `--disable` together: a second wrapper that
      // joins this proxy states what this proxy masks, never what its own flags say.
      disabled: disabledKindsFor(config.level, config.disabledKinds),
      // The categories actually masked right now — the console's rules panel re-reads this
      // rather than replaying the level arithmetic in a browser.
      masking: activeCategories(config.level, config.disabledKinds),
      ner: modelOn(),
      mode: config.mode,
      // Whether a live view is served: `openmasq-proxy console` asks before it opens a link.
      console: consoleOn,
    });
  });
  return router;
}
