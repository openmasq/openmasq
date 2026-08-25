import { pseudonymize, redactionCategory, type RedactionMatch } from "@openmasq/redact";
import type { Conversation } from "../types";

/**
 * The import-time redaction pass (rule 11's honest edge): an imported conversation
 * holds REAL values that were already shared with the ORIGINAAL provider — but if the
 * user CONTINUES the thread here, `buildWireHistory` re-sends that history to whatever
 * model they picked, redacted ONLY by replaying the conversation vault (`toWire`).
 * History is never re-detected at send time, so import time is the one shot to build
 * that vault. This runs the deterministic engine tier of `pseudonymize` (no model, no
 * network — BETA scope) over every message, accumulating ONE vault + kinds + a fresh
 * CSPRNG salt per conversation. The redacted output text is DISCARDED on purpose:
 * display keeps the real content (the marks come from the vault), the wire replays it.
 */

/** Same 31-bit CSPRNG mint as the send pipeline's first-redaction path. */
function mintSalt(): number {
  return ((globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? 1) & 0x7fffffff) || 1;
}

export async function redactImported(
  conv: Conversation,
  /** `mode` : ce que verra le modèle quand cette conversation importée repartira vers lui
   *  (le coffre est constitué ICI, donc le mode est figé ICI — comme le salt). */
  opts: { disabledKinds: string[]; mode?: "fake" | "token" },
): Promise<Conversation> {
  const vault: Record<string, string> = {};
  const kinds: Record<string, string> = {};
  const salt = mintSalt();
  for (const m of conv.messages) {
    // Sequential on purpose: the vault must accumulate so a value repeated across
    // turns keeps ONE fake (same invariant as the live send path).
    const r = await pseudonymize(m.content, {
      vault,
      kinds,
      salt,
      mode: opts.mode ?? "fake",
      numbers: false,
      disabledKinds: opts.disabledKinds,
    });
    // Same fine-kind derivation as the live send (`deriveRedactedSpans`): the
    // canonical category first, the raw rule name as fallback.
    for (const match of r.matches as (RedactionMatch & { category?: string })[])
      kinds[match.value] = redactionCategory(match.category ?? match.type);
  }
  if (Object.keys(vault).length === 0) return conv;
  return {
    ...conv,
    redactionVault: vault,
    redactionKinds: kinds,
    redactionSalt: salt,
    redactionMode: opts.mode ?? "fake",
  };
}
