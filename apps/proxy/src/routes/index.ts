// Mount order IS the allow-list: the masked commands first (at `/` and under their explicit
// family prefix), the passthrough last — it relays a text-less method and refuses the rest.
import { Router } from "express";
import type { RelayDeps } from "../lib/relay.js";
import mountAnthropicRoutes from "../features/anthropic/routes.js";
import mountGeminiRoutes from "../features/gemini/routes.js";
import mountOpenAiRoutes from "../features/openai/routes.js";
import mountPassthrough from "../features/passthrough/routes.js";

export function apiRouter(deps: RelayDeps): Router {
  const router = Router();
  const openai = mountOpenAiRoutes(Router(), deps);
  const anthropic = mountAnthropicRoutes(Router(), deps);
  const gemini = mountGeminiRoutes(Router(), deps);
  router.use("/openai", openai);
  router.use("/anthropic", anthropic);
  router.use("/gemini", gemini);
  router.use(openai);
  router.use(anthropic);
  router.use(gemini);
  mountPassthrough(router, deps);
  return router;
}
