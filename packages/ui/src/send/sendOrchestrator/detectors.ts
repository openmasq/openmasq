import { captureEvent } from "../../analytics";
import type { Host } from "../../host";
import { resolveRedactModel } from "../../prompt/models";
import { isNerWarmed, markNerWarmed } from "../../state/redaction/nerWarm";
import type { Settings } from "../../types";
import { redactionFailReason } from "../sendAnalytics";
import type { Dbg } from "./turnSetup";

/** A slow or hung redaction endpoint must never block the chat; on timeout the caller decides. */
const REDACT_TIMEOUT_MS = 12000;

type CompleteMessages = { role: "system" | "user" | "assistant"; content: string }[];
export type CompleteFn = (messages: CompleteMessages) => Promise<string>;
export type DetectLocalFn = (text: string) => Promise<Awaited<ReturnType<NonNullable<Host["detectLocalPii"]>>>>;

/**
 * The model-based detector: any non-session provider the settings name. The key is
 * injected in main ("redactModel" key, else the provider's); the base URL only applies
 * to openai-compat. Timing and failures reach the Debug Log and the anonymised telemetry.
 */
export function makeCompleteFn(host: Host, settings: Settings, dbg: Dbg): CompleteFn | undefined {
  if (!host.complete) return undefined;
  const redactProvider = settings.redactProvider;
  return async (messages) => {
    const t0 = performance.now();
    const redactModelId = resolveRedactModel(redactProvider, settings.redactModelName);
    const chars = messages[messages.length - 1]?.content.length ?? 0;
    try {
      const reply = await Promise.race([
        host.complete!({
          provider: redactProvider,
          model: redactModelId,
          messages,
          baseUrl:
            redactProvider === "openai-compat"
              ? settings.redactModelBaseUrl || settings.openaiCompatBaseUrl
              : undefined,
          temperature: 0,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("redaction model timed out")), REDACT_TIMEOUT_MS),
        ),
      ]);
      const ms = performance.now() - t0;
      dbg({
        type: "tool",
        name: "redaction · détection IA",
        ok: true,
        args: `${redactProvider} · ${redactModelId} · ${chars} car.`,
        result: `${Math.round(ms)} ms`,
      });
      captureEvent({ name: "redaction_timing", engine: "model", model: redactModelId, ms, ok: true, chars });
      return reply;
    } catch (e) {
      dbg({
        type: "tool",
        name: "redaction · détection IA",
        ok: false,
        args: `${redactProvider} · ${redactModelId}`,
        result: `${Math.round(performance.now() - t0)} ms`,
        error: e instanceof Error ? e.message : String(e),
      });
      // A failure contributes to the latency distribution too (the timeout is its worst case).
      captureEvent({
        name: "redaction_timing",
        engine: "model",
        model: redactModelId,
        ms: performance.now() - t0,
        ok: false,
        reason: redactionFailReason(e),
      });
      throw e;
    }
  };
}

/**
 * The offline NER detector: same verbatim `Detection[]` as the model detector, in-process
 * via the host, no network. The first call also loads the model, so its timing includes
 * that one-time warm.
 */
export function makeDetectLocalFn(host: Host, dbg: Dbg): DetectLocalFn | undefined {
  if (!host.detectLocalPii) return undefined;
  return async (t) => {
    const t0 = performance.now();
    try {
      const found = await host.detectLocalPii!({ text: t });
      const ms = performance.now() - t0;
      const cold = !isNerWarmed();
      markNerWarmed();
      dbg({
        type: "tool",
        name: "redaction · NER local",
        ok: true,
        args: `${t.length} car.${cold ? " · cold" : ""}`,
        result: `${found.length} entités · ${Math.round(ms)} ms`,
      });
      // Bucketed latency, no content; the engine label is fixed (the model is platform-fixed).
      captureEvent({ name: "redaction_timing", engine: "local", model: "bert-ner", ms, cold, ok: true, chars: t.length });
      return found;
    } catch (e) {
      dbg({
        type: "tool",
        name: "redaction · NER local",
        ok: false,
        args: `${t.length} car.`,
        result: `${Math.round(performance.now() - t0)} ms`,
        error: e instanceof Error ? e.message : String(e),
      });
      captureEvent({
        name: "redaction_timing",
        engine: "local",
        model: "bert-ner",
        ms: performance.now() - t0,
        ok: false,
        reason: redactionFailReason(e),
        chars: t.length,
      });
      throw e;
    }
  };
}
