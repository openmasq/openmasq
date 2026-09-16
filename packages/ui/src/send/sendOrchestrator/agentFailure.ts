import { captureError, captureEvent } from "../../analytics";
import { httpStatus, requestIdOf, retriesOf } from "../../state/errors/fields";
import { cleanErrorText, humanizeSendError, isRateLimitError, sendErrorAction, sendErrorReason } from "../../state/errors";
import { estimateTurnUsage } from "../estimateUsage";
import type { ChatMessage } from "@openmasq/llm";
import type { Conversation } from "../../types";
import type { Routing } from "./platformGate";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

export interface AgentFailure {
  err: unknown;
  aborted: boolean;
  /** The provider reported this turn's usage before it failed: never overwrite it with an estimate. */
  usageReported: boolean;
  toolKinds: Record<string, string>;
  history: ChatMessage[];
}

/**
 * Whatever ends an agentic turn, the vault entries minted by its tool results are
 * COMMITTED: the assistant text on screen is already un-redacted, so losing them would
 * replay real values in clear on the next send.
 */
export function commitTurnVault(
  ctx: TurnContext,
  r: RedactionSetup,
  toolKinds: Record<string, string>,
  extra: (c: Conversation) => Partial<Conversation> = () => ({}),
): void {
  ctx.d.patchConversation(ctx.convId, (c) => ({
    ...c,
    redactionVault: { ...r.vault },
    redactionSalt: r.redactionSalt,
    redactionKey: r.redactionKey,
    redactionMode: r.redactionMode,
    redactionKinds: { ...c.redactionKinds, ...toolKinds },
    ...extra(c),
    updatedAt: Date.now(),
  }));
}

/**
 * A thrown agentic turn: Stop pressed mid-loop just settles (the loop finalised the
 * bubble); anything else is persisted INLINE on the bubble with a humanised message, a
 * proposed way out, and an ESTIMATED usage when none was reported (a failed turn already
 * consumed tokens). The raw detail goes to the Debug Log, a BOUNDED code to analytics.
 */
export function failAgentTurn(ctx: TurnContext, r: RedactionSetup, routing: Routing, f: AgentFailure): void {
  const { d, model, convId, updateAssistant } = ctx;
  d.cancelRef.current.delete(convId);
  d.finishRef.current.delete(convId);
  if (f.aborted) {
    commitTurnVault(ctx, r, f.toolKinds);
    d.setIsStreaming(false);
    return;
  }
  const detail = f.err instanceof Error ? f.err.message : String(f.err);
  ctx.dbg({
    type: "error",
    scope: `tool · ${model.id}`,
    message: isRateLimitError(f.err) ? `rate limit (429) — ${detail}` : detail,
  });
  captureError({
    scope: "mcp",
    code: isRateLimitError(f.err) ? "rate-limit" : "tool-loop",
    name: f.err instanceof Error ? f.err.name : undefined,
    message: detail,
  });
  captureEvent({
    name: "send_error",
    provider: model.provider,
    model: model.id,
    reason: sendErrorReason(detail),
    status: httpStatus(detail),
    requestId: requestIdOf(detail),
    retries: retriesOf(detail),
  });
  // `humanizeSendError` FIRST, 429 included; the action follows the cause.
  const act = sendErrorAction(detail, model.provider);
  const friendly =
    humanizeSendError(detail, d.t, { personal: !d.orgProfileRef.current, provider: model.provider }) ??
    r.fromWire(cleanErrorText(detail));
  commitTurnVault(ctx, r, f.toolKinds);
  updateAssistant({
    pending: false,
    error: true,
    errorText: friendly,
    ...(act ? { errorAction: act } : {}),
    ...(f.usageReported
      ? {}
      : {
          usage: {
            model: model.id,
            ...estimateTurnUsage(f.history, ""),
            billed: (routing.effectivePlatform ? "subscription" : "byo") as "subscription" | "byo",
            estimated: true,
          },
        }),
  });
  d.setIsStreaming(false);
}
