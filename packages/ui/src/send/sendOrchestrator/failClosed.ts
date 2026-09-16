import { BRAND } from "@openmasq/branding";
import { captureError } from "../../analytics";
import { RedactionUnavailableError } from "../../state/errors";
import type { TurnContext } from "./turnSetup";

export type FailClosed = (reason: string) => never;

/**
 * FAIL CLOSED: the AI redaction pass the user relies on did not run (no detector on this
 * host, endpoint unreachable, model pass failed). The send is BLOCKED; it never falls back
 * to regex, which would leak the free-form PII the model was supposed to catch. The block
 * is persisted inline on the assistant bubble (survives reload, offers « Réessayer ») and
 * the throw unwinds the rest of the send; the caller treats a thrown send as handled.
 */
export function makeFailClosed(ctx: TurnContext): FailClosed {
  const { d, dbg, convId, assistantMsg } = ctx;
  return (reason) => {
    console.warn(`[${BRAND.slug}] cloud redaction unavailable → send BLOCKED (fail-closed):`, reason);
    dbg({ type: "error", scope: "cloud-redaction", message: reason });
    captureError({ scope: "redaction", code: "fail-closed", message: reason });
    d.cancelRef.current.delete(convId);
    d.patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === assistantMsg.id
          ? { ...m, pending: false, error: true, errorText: new RedactionUnavailableError(reason).message }
          : m,
      ),
      updatedAt: Date.now(),
    }));
    d.setIsStreaming(false);
    throw new RedactionUnavailableError(reason);
  };
}
