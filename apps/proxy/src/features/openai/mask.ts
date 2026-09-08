// The one place a command masks a body: every text the wire hands over goes through the
// masker with THIS request's vault and mode, and every match lands on `res.locals` for the
// audit line. Shared by both families (the Anthropic commands import it too).
import type { Response } from "express";
import type { Locals, RelayDeps } from "../../lib/relay.js";
import type { MaskFn } from "./wire.js";

export async function maskRequest(
  deps: RelayDeps,
  res: Response,
  body: Record<string, unknown>,
  maskBody: (body: Record<string, unknown>, mask: MaskFn) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const locals = res.locals as unknown as Locals;
  const mask: MaskFn = async (text) => {
    const r = await deps.masker.mask(text, locals.vault, locals.mode, locals.key);
    locals.matches.push(...r.matches);
    return r.text;
  };
  return maskBody(body, mask);
}
