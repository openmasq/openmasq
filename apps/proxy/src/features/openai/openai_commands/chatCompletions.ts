// POST /v1/chat/completions — mask the messages into the request's vault, relay, restore.
import type { Request, Response } from "express";
import { relay, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../mask.js";
import { OpenAiStreamRewriter } from "../stream.js";
import { maskChatRequest, restoreChatResponse } from "../wire.js";

export default (deps: RelayDeps) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(deps, res, req.body as Record<string, unknown>, maskChatRequest);
    await relay(deps, req, res, {
      family: "openai",
      body,
      restore: restoreChatResponse,
      stream: (vault, fns) => new OpenAiStreamRewriter(vault, fns),
    });
  };
