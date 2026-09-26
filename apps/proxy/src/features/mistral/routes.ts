// The Mistral family: Mistral's API is OpenAI's Chat Completions and Embeddings wire, sent to
// `config.mistral`. Mounted under `/mistral` ONLY (`routes/index.ts`): at the root these paths
// already belong to OpenAI. Anything else Mistral serves (FIM, OCR, agents, audio) has no
// masked command here, so a POST to it meets the passthrough's 501 — never a body in clear.
import type { Router } from "express";
import type { RelayDeps } from "../../lib/relay.js";
import chatCompletions from "../openai/openai_commands/chatCompletions.js";
import embeddings from "../openai/openai_commands/embeddings.js";

export default (router: Router, deps: RelayDeps): Router => {
  router.post("/v1/chat/completions", chatCompletions(deps, "mistral"));
  router.post("/v1/embeddings", embeddings(deps, "mistral"));
  return router;
};
