// POST /v1beta/models/<model>:generateContent and :streamGenerateContent — the same masking;
// the stream is rewritten only in its SSE form (`?alt=sse`, what the SDKs and Gemini CLI use).
// A stream asked as a bare JSON array is refused rather than relayed with the fakes in place.
import type { Request, Response } from "express";
import { relay, type RelayDeps } from "../../../lib/relay.js";
import { maskRequest } from "../../openai/mask.js";
import { GeminiStreamRewriter } from "../stream.js";
import { maskGenerateRequest, restoreGenerateResponse } from "../wire.js";

export default (deps: RelayDeps) =>
  async (req: Request, res: Response): Promise<void> => {
    const streaming = req.path.endsWith(":streamGenerateContent");
    if (streaming && req.query.alt !== "sse") {
      res.status(501).json({
        error: {
          type: "openmasq_proxy",
          message: "Streaming is restored in its SSE form only: add ?alt=sse (what the SDKs send).",
        },
      });
      return;
    }
    const body = await maskRequest(
      deps,
      res,
      req.body as Record<string, unknown>,
      maskGenerateRequest,
    );
    await relay(deps, req, res, {
      family: "gemini",
      body: streaming ? { ...body, stream: true } : body,
      restore: restoreGenerateResponse,
      stream: streaming ? (vault, fns) => new GeminiStreamRewriter(vault, fns) : undefined,
      // Gemini carries no `stream` field: the path decides. `relay` reads `body.stream`, so it
      // is set above for the decision and stripped before the bytes leave.
      strip: streaming ? ["stream"] : undefined,
    });
  };
