import type { ChatMessage, StreamDone } from "@openmasq/llm";
import { captureEvent } from "../../analytics";
import { reasoningRelay } from "../../state/conversation/reasoningRelay";
import { updateDebug } from "../../state/debug/debug";
import { httpStatus, requestIdOf, retriesOf } from "../../state/errors/fields";
import { cleanErrorText, humanizeSendError, sendErrorAction, sendErrorReason } from "../../state/errors";
import { uid } from "../../state/storePersistence";
import { estimateTurnUsage } from "../estimateUsage";
import type { Routing } from "./platformGate";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

/** Time to first token, then the allowed gap between tokens; re-armed on every token. */
const STARTUP_MS = 75000;
const STALL_MS = 45000;
/** De-redaction of the whole reply and the markdown re-parse are O(content): flush at animation cadence, not per token. */
const FLUSH_MS = 40;

/**
 * The plain stream: no tools. Tokens are accumulated, de-redacted and rendered throttled;
 * a stalled stream fails gracefully, and every outcome (done, stopped, failed) persists
 * the turn's usage, MEASURED when the provider reported it and ESTIMATED otherwise.
 */
export function runPlainStream(
  ctx: TurnContext,
  r: RedactionSetup,
  routing: Routing,
  history: ChatMessage[],
  wireDebugId: string,
): Promise<void> {
  const { d, model, provider, convId, latency, updateAssistant } = ctx;
  const { host, settings, t } = d;
  return new Promise<void>((resolve) => {
    let acc = "";
    let settled = false;
    latency.t0 = Date.now();
    latency.tFirst = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = (ms: number, msg: string) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => onError(msg), ms);
    };

    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const flush = () => {
      flushTimer = undefined;
      if (!dirty || settled) return;
      dirty = false;
      updateAssistant({ content: r.fromWire(acc), pending: true });
    };
    const scheduleFlush = () => {
      dirty = true;
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    };
    const clearFlush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
    };

    // The reflection has its own channel, sealed when the turn settles, never in `acc`.
    const reasoning = reasoningRelay(r.fromWire, (text) => updateAssistant({ reasoning: text }));
    const onDelta = (delta: string) => {
      if (settled) return;
      if (!latency.tFirst && delta) latency.tFirst = Date.now();
      acc += delta;
      armWatchdog(STALL_MS, t.errors.replyInterrupted);
      scheduleFlush();
    };
    // Never nothing: zero is the one answer that is certainly wrong (`send/estimateUsage.ts`).
    const turnUsage = (reported?: { inputTokens: number; outputTokens: number }) => {
      const counts = reported ?? estimateTurnUsage(history, acc);
      return {
        model: model.id,
        inputTokens: counts.inputTokens,
        outputTokens: counts.outputTokens,
        billed: (routing.effectivePlatform ? "subscription" : "byo") as "subscription" | "byo",
        ...(reported ? {} : { estimated: true }),
      };
    };
    const onDone = (done?: StreamDone) => {
      if (settled) return;
      clearFlush();
      reasoning.done();
      const usage = done?.usage;
      const restored = r.fromWire(acc);
      // A MISSING finish reads as `cut`, not as complete: every in-repo provider always
      // reports one, so `undefined` only remains on an aborted or dropped stream.
      const truncated = done?.finish === "length" || done?.finish === "cut" || done?.finish == null;
      updateAssistant({
        content: restored,
        pending: false,
        incomplete: restored.trim() === "" || truncated,
        usage: turnUsage(usage),
      });
      // Telemetry stays MEASURED-only: an estimate would skew tokens/s and the aggregates.
      if (usage) {
        captureEvent({
          name: "token_usage",
          provider,
          model: model.id,
          input: usage.inputTokens,
          output: usage.outputTokens,
          ...(usage.cachedInputTokens ? { cached: usage.cachedInputTokens } : {}),
          ...(usage.cacheWriteInputTokens ? { cacheWrite: usage.cacheWriteInputTokens } : {}),
        });
        ctx.emitModelLatency(latency.t0, latency.tFirst, usage.outputTokens, false, 0, usage.inputTokens);
        updateDebug(wireDebugId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
        });
      }
      finish();
    };
    const onError = (message: string) => {
      if (settled) return;
      clearFlush();
      reasoning.done();
      const restored = r.fromWire(acc);
      // The Debug Log keeps the RAW detail; the bubble shows the humanised message.
      const rawMsg = r.fromWire(message);
      const safeMsg =
        humanizeSendError(message, t, { personal: !d.orgProfileRef.current, provider: model.provider }) ??
        r.fromWire(cleanErrorText(message));
      const act = sendErrorAction(message, model.provider);
      ctx.dbg({ type: "error", scope: `stream · ${model.id}`, message: rawMsg });
      captureEvent({
        name: "send_error",
        provider: model.provider,
        model: model.id,
        reason: sendErrorReason(message),
        status: httpStatus(message),
        requestId: requestIdOf(message),
        retries: retriesOf(message),
      });
      // Persisted ON the bubble with any partial reply: survives a reload, offers a
      // « Réessayer » that regenerates in place. Only a turn that never streamed cost nothing.
      updateAssistant({
        content: restored,
        pending: false,
        error: true,
        errorText: safeMsg,
        ...(act ? { errorAction: act } : {}),
        ...(acc ? { usage: turnUsage() } : {}),
      });
      finish();
    };

    // A synchronous dispatch failure surfaces as an error and finishes; never a spinning loader.
    try {
      const cancel = host.startChat(
        {
          requestId: uid(),
          provider,
          model: model.id,
          messages: history,
          // The key is injected in main, EXCEPT platform models which carry the session token.
          apiKey: routing.effectivePlatform ? routing.platformToken : undefined,
          baseUrl: routing.effectivePlatform
            ? routing.platformBaseUrl
            : provider === "openai-compat"
              ? settings.openaiCompatBaseUrl
              : undefined,
        },
        { onChunk: onDelta, onReasoning: reasoning.push, onDone, onError },
      );
      d.cancelRef.current.set(convId, cancel);
      armWatchdog(STARTUP_MS, t.errors.replyNeverStarted);
      // Stop finalises this stream directly, treating the partial reply as complete.
      d.finishRef.current.set(convId, onDone);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }

    function finish() {
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      d.cancelRef.current.delete(convId);
      d.finishRef.current.delete(convId);
      d.setIsStreaming(false);
      resolve();
    }
  });
}
