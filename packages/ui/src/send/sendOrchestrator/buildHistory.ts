import { contextWindow, supportsTools } from "@openmasq/llm";
import type { ChatMessage } from "@openmasq/llm";
import { featureUsage } from "../../state/billing/featureAccess";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { buildSystemContent, buildWireHistory } from "../buildWire";
import { fitHistoryToContext } from "../historyWindow";
import { makeRedactFn } from "../redactionEngine";
import { shouldRedactSystemPrompt } from "../redactionOptions";
import type { FailClosed } from "./failClosed";
import type { RedactedTurn } from "./redactionPasses";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

export interface WireHistory {
  history: ChatMessage[];
  /** The model can call tools AND the host offers them: the agentic path is taken. */
  usesTools: boolean;
}

/**
 * Redacts a CUSTOM system prompt into the same vault (fail-closed like the message), then
 * builds the wire from the stored ORIGINAL history through `toWire` and slides a context
 * window over it. Returns null when the user stopped before the dispatch.
 */
export async function buildHistory(
  ctx: TurnContext,
  r: RedactionSetup,
  red: RedactedTurn,
  failClosed: FailClosed,
): Promise<WireHistory | null> {
  const { d, conv, opts, model, dbg, sendAbort, stoppedEarly } = ctx;
  const { host, settings } = d;
  // The custom prompt is only vault-REPLAYED by `toWire`; NOVEL PII the user wrote in the
  // settings must go through the detector first. The default prompt pays nothing.
  if (shouldRedactSystemPrompt(settings.systemPrompt, DEFAULT_SETTINGS.systemPrompt)) {
    try {
      const sys = await makeRedactFn(host, settings, d.orgProfileRef.current?.forcedCategories)(
        settings.systemPrompt,
        sendAbort.signal,
        r.vault,
        conv.redactCategories,
        // The SAME seed as the message, or the prompt's fakes come from the public mapping.
        { salt: r.redactionSalt, key: r.redactionKey },
      );
      if (sys.modelError) failClosed(`détection du prompt système échouée (${sys.modelError})`);
    } catch (e) {
      if (stoppedEarly()) return null;
      failClosed(e instanceof Error ? e.message : String(e));
    }
  }
  // Last boundary before the dispatch: past this, each path owns its own cancellation.
  if (stoppedEarly()) return null;

  // Today's date and the n-token instruction ride into BOTH the plain stream and the agentic
  // loop; `skills` off means the model is no longer asked to suggest any.
  const systemContent =
    buildSystemContent(r.toWire, settings.systemPrompt, r.numberMode(), { skills: featureUsage("competences") }) +
    (red.memoryWire ? `\n\n${red.memoryWire}` : "");
  const builtHistory = buildWireHistory(conv.messages, red.userWire, systemContent, opts.imageAttachments, r.toWire);

  // Keep the system message + the most recent turns that fit; reserve headroom for the
  // reply and, on the agentic path, the tool schemas. Unknown window ⇒ no trim.
  const usesTools = !!(host.mcp && host.completeTools) && supportsTools(model.id);
  const ctxTokens = contextWindow(model.id);
  const { messages: history, dropped: droppedTurns } = fitHistoryToContext(builtHistory, {
    contextTokens: ctxTokens,
    reserveTokens: ctxTokens ? Math.round(ctxTokens * (usesTools ? 0.45 : 0.2)) : 0,
    summary: conv.contextSummary,
  });
  if (droppedTurns > 0) {
    dbg({
      type: "phase",
      scope: "system",
      label: "contexte tronqué",
      detail: `${droppedTurns} message(s) ancien(s) omis (fenêtre ${ctxTokens} tokens)`,
    });
  }
  return { history, usesTools };
}
