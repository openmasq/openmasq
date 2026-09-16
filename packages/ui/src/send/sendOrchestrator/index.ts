import type { ExtractedFile } from "../../host";
import { runAgentTurn } from "./agentTurn";
import { buildHistory } from "./buildHistory";
import { makeFailClosed } from "./failClosed";
import { gateAndRoute } from "./platformGate";
import { plainStreamFallbackNote } from "./dispatchNote";
import { runPlainStream } from "./plainStream";
import { runRedactionPasses } from "./redactionPasses";
import { setupRedaction } from "./redactionSetup";
import { persistUserTurn } from "./persistUserTurn";
import { setupTurn } from "./turnSetup";
import type { SendMessageDeps, SendOptions } from "./types";

export type { SendMessageDeps, SendOptions } from "./types";

/**
 * The send, phase by phase: bind the turn and show its bubbles → pre-flight gate and
 * routing → prepare the reversible redaction → run the detection passes → persist the
 * user turn → build the wire history → dispatch (agentic loop, else plain stream).
 * Every phase returns null when the turn is already resolved; the model only ever sees
 * what the passes produced, and the reply is restored through the same vault.
 */
export function createSendMessage(d: SendMessageDeps) {
  return async (text: string, attachments?: ExtractedFile[], opts?: SendOptions): Promise<void> => {
    const ctx = setupTurn(d, text, attachments, opts ?? {});
    const routing = await gateAndRoute(ctx);
    if (!routing) return;
    const r = setupRedaction(ctx);
    const failClosed = makeFailClosed(ctx);
    const red = await runRedactionPasses(ctx, r, failClosed);
    if (!red) return;
    persistUserTurn(ctx, r, red);
    const wire = await buildHistory(ctx, r, red, failClosed);
    if (!wire) return;
    d.setIsStreaming(true);
    plainStreamFallbackNote(ctx, wire.usesTools);
    if (wire.usesTools && d.host.mcp && d.host.completeTools) {
      const over = await runAgentTurn(ctx, r, red, routing, wire.history);
      if (over) return;
    }
    await runPlainStream(ctx, r, routing, wire.history, red.wireDebugId);
  };
}
