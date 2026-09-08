// The Anthropic family. Mounted at `/` and at `/anthropic` by `routes/index.ts`.
import type { Router } from "express";
import type { RelayDeps } from "../../lib/relay.js";
import countTokens from "./anthropic_commands/countTokens.js";
import messages from "./anthropic_commands/messages.js";

export default (router: Router, deps: RelayDeps): Router => {
  router.post("/v1/messages", messages(deps));
  router.post("/v1/messages/count_tokens", countTokens(deps));
  return router;
};
