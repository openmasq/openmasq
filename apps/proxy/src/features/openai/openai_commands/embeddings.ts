// POST /v1/embeddings — the input is masked; nothing to restore in a vector.
import type { Request, Response } from "express";
import { relay, type Family, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../mask.js";
import { maskEmbeddingsRequest } from "../wire.js";

export default (deps: RelayDeps, family: Family = "openai") =>
  async (req: Request, res: Response): Promise<void> => {
    const body = await maskRequest(
      deps,
      res,
      req.body as Record<string, unknown>,
      maskEmbeddingsRequest,
    );
    await relay(deps, req, res, { family, body });
  };
