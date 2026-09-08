// POST /v1/messages/count_tokens — same masking as a send (the count is of what the model
// would read); the reply is a number, nothing to restore.
import type { Request, Response } from "express";
import { relay, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../../openai/mask.js";
import { maskMessagesRequest } from "../wire.js";

export default (deps: RelayDeps) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(
      deps,
      res,
      req.body as Record<string, unknown>,
      maskMessagesRequest,
    );
    await relay(deps, req, res, { family: "anthropic", body });
  };
