// POST bodies are read raw (any content-type — a client may omit it) and must parse as a
// JSON OBJECT, or the request stops here with a 400: a body the proxy cannot read is a body
// it cannot mask, and an unmasked forward is the one outcome this middleware exists to prevent.
import express, { type NextFunction, type Request, type Response } from "express";

export const MAX_BODY = "32mb";

export const rawBody = express.raw({ type: () => true, limit: MAX_BODY });

export function parseJsonObject(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "POST") return next();
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({
      error: {
        type: "openmasq_proxy",
        message: "The proxy only forwards JSON bodies it can read.",
      },
    });
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    res
      .status(400)
      .json({ error: { type: "openmasq_proxy", message: "Expected a JSON object body." } });
    return;
  }
  req.body = parsed;
  next();
}
