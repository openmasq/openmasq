// POST /v1/messages — system and messages masked, content restored (text for the reader,
// tool_use inputs for the executor), streaming rewritten block by block.
import type { Request, Response } from "express";
import { relay, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../../openai/mask.js";
import { AnthropicStreamRewriter } from "../stream.js";
import { maskMessagesRequest, restoreMessagesResponse } from "../wire.js";

export default (deps: RelayDeps) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(
      deps,
      res,
      req.body as Record<string, unknown>,
      maskMessagesRequest,
    );
    await relay(deps, req, res, {
      family: "anthropic",
      body,
      restore: restoreMessagesResponse,
      stream: (vault, fns) => new AnthropicStreamRewriter(vault, fns),
    });
  };
