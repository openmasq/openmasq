// POST /v1/chat/completions — mask the messages into the request's vault, relay, restore.
// Mistral speaks the same wire (plus its `thinking` parts, which `wire.ts` knows): only the
// upstream differs, hence the family.
import type { Request, Response } from "express";
import { relay, type Family, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../mask.js";
import { OpenAiStreamRewriter } from "../stream.js";
import { maskChatRequest, restoreChatResponse } from "../wire.js";

export default (deps: RelayDeps, family: Family = "openai") =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(deps, res, req.body as Record<string, unknown>, maskChatRequest);
    await relay(deps, req, res, {
      family,
      body,
      restore: restoreChatResponse,
      stream: (vault, fns) => new OpenAiStreamRewriter(vault, fns),
    });
  };
