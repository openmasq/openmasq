import type { NextFunction, Request, Response } from "express";

/**
 * Minimal in-memory per-IP fixed-window rate limiter. Enough to blunt brute-force
 * on /token in a single-instance broker; swap for a shared store in production.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now > rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (rec.count >= max) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    rec.count++;
    next();
  };
}
