/**
 * The subscription's TOOLED turn: the `completeTools` primitive served by the user's
 * CLI — same contract as `completeWithTools` (@openmasq/llm), so that OpenMasq's
 * agentic loop drives this path EXACTLY like an API model.
 *
 * Principle (inverted loop): the CLI receives the turn's tool catalogue via the
 * MCP bridge (`toolsBridge`), but the bridge EXECUTES nothing — it captures the first call and this
 * turn kills the CLI immediately, returning `{toolCalls}` to the loop. It un-redacts,
 * passes the write gate, executes, re-redacts — as always — then re-submits
 * the whole history here. Stateless, like every other provider: the CLI session
 * is disposable, OpenMasq remains the source of truth for its conversation.
 *
 * THIS file is the SKELETON, once for all CLIs (rule 9): fail-closed
 * refusal, flattening, bridge, the "capture ⇄ end of stream" race, cleanup. What
 * varies from one CLI to another — the flags, how to hand it the bridge and its token,
 * the event interpreter — is a RECIPE, and nothing else:
 * `claudeToolsTurn.ts` (0600 config file) and `codexToolsTurn.ts` (`-c` override +
 * environment variable). A 3rd CLI only adds a recipe.
 */
import { randomUUID } from "node:crypto";
import type { ChatMessage, CompleteToolsResult, StreamDone, ToolDef } from "@openmasq/llm";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";
import { claudeToolsRecipe } from "./claudeToolsTurn";
import { codexToolsRecipe } from "./codexToolsTurn";
import type { SubscriptionTurnEnv } from "./turn";
import { streamCliProcess } from "./spawnStream";
import { startToolsBridge, type CapturedToolCall } from "./toolsBridge";
import type { ToolsCliRecipe, ToolsSpawnPlan } from "./toolsRecipe";

/** A subscription CLI = a recipe. The absence of `cli` means `claude` (history). */
const RECIPES: Record<NonNullable<SubscriptionTurnEnv["cli"]>, ToolsCliRecipe> = {
  claude: claudeToolsRecipe,
  codex: codexToolsRecipe,
};

/** A tooled turn that returns nothing in 5 min is dead, not slow — we kill it (fail closed). */
const TURN_TIMEOUT_MS = 300_000;

export interface SubscriptionToolsTurnOptions {
  messages: ChatMessage[];
  tools: ToolDef[];
  modelId?: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * The tool history, made READABLE in the flattened transcript: the CLI model must
 * see its past calls and their (redacted) results the way an API model sees them
 * in `messages`. An assistant turn reduced to `toolCalls` with no text would otherwise be
 * DROPPED by the flattener (empty block) — the model would call the same tool again in a loop.
 */
export function renderToolHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.toolCalls?.length) return m;
    const calls = m.toolCalls
      .map((c) => `[Appel d'outil : ${c.name}(${JSON.stringify(c.arguments)})]`)
      .join("\n");
    return { ...m, content: [m.content.trim(), calls].filter(Boolean).join("\n") };
  });
}

/**
 * A `completeTools` turn on the subscription. Refusal BEFORE any spawn (same messages as
 * the plain turn); capture ⇒ `{toolCalls}`; end of stream with no call ⇒ `{text}`.
 */
export async function completeSubscriptionTools(
  env: SubscriptionTurnEnv,
  opts: SubscriptionToolsTurnOptions,
): Promise<CompleteToolsResult> {
  const recipe = RECIPES[env.cli ?? "claude"];
  if (hasUnsupportedAttachments(opts.messages)) {
    throw new Error(
      `Le modèle « ${env.label ?? recipe.label} » ne prend pas encore les pièces jointes — ` +
        "envoyez du texte, ou choisissez un modèle avec vision.",
    );
  }
  const { system, prompt } = flattenForCli(renderToolHistory(opts.messages));
  if (!prompt) throw new Error("Rien à envoyer : la conversation ne contient aucun message.");

  const bridge = await startToolsBridge(opts.tools);
  let plan: ToolsSpawnPlan;
  try {
    plan = await recipe.prepare({
      bridge,
      toolNames: opts.tools.map((t) => t.name),
      prompt,
      system,
      modelId: opts.modelId,
    });
  } catch (err) {
    bridge.close(); // a recipe that fails doesn't leave a port open behind it
    throw err;
  }

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  let text = "";
  let captured: CapturedToolCall | null = null;

  const run = (async (): Promise<StreamDone> => {
    const it = streamCliProcess({
      binPath: env.binPath,
      args: plan.args,
      cwd: env.cwd,
      extraEnv: plan.extraEnv,
      interpret: recipe.interpret,
      signal: controller.signal,
      onReasoning: opts.onReasoning,
    });
    let r = await it.next();
    while (!r.done) {
      text += r.value;
      opts.onDelta?.(r.value);
      r = await it.next();
    }
    return r.value;
  })();

  try {
    const outcome = await Promise.race([
      run.then((done) => ({ kind: "done" as const, done })),
      bridge.nextCall().then((call) => ({ kind: "call" as const, call })),
    ]);

    if (outcome.kind === "call") {
      captured = outcome.call;
      controller.abort(); // the CLI is waiting for a result that will never come: we kill it.
      await run.catch(() => {}); // its death is INTENTIONAL — not an error to report
      return {
        text,
        toolCalls: [{ id: `cli_${randomUUID()}`, name: captured.name, arguments: captured.arguments }],
        stopReason: "tool_calls",
      };
    }
    const finish = outcome.done.finish;
    return {
      text,
      toolCalls: [],
      stopReason: finish === "stop" ? "stop" : finish === "length" ? "length" : "other",
      usage: outcome.done.usage,
    };
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onCallerAbort);
    bridge.close();
    await plan.cleanup?.();
  }
}
