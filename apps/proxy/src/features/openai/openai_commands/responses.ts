// POST /v1/responses — the Responses API (what Codex speaks): instructions and input masked,
// output restored, the stream rewritten event by event.
import type { Request, Response } from "express";
import { relay, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../mask.js";
import { ResponsesStreamRewriter } from "../responsesStream.js";
import { maskResponsesRequest, restoreResponsesResponse } from "../wire.js";

export default (deps: RelayDeps) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(
      deps,
      res,
      req.body as Record<string, unknown>,
      maskResponsesRequest,
    );
    await relay(deps, req, res, {
      family: "openai",
      body,
      restore: restoreResponsesResponse,
      stream: (vault, fns) => new ResponsesStreamRewriter(vault, fns),
    });
  };
