// The OpenAI family: the three routes the proxy knows how to mask. Mounted at `/` and at
// `/openai` (the explicit-family prefix) by `routes/index.ts`.
import type { Router } from "express";
import type { RelayDeps } from "../../lib/relay.js";
import chatCompletions from "./openai_commands/chatCompletions.js";
import embeddings from "./openai_commands/embeddings.js";
import responses from "./openai_commands/responses.js";

export default (router: Router, deps: RelayDeps): Router => {
  router.post("/v1/chat/completions", chatCompletions(deps));
  router.post("/v1/responses", responses(deps));
  router.post("/v1/embeddings", embeddings(deps));
  return router;
};
