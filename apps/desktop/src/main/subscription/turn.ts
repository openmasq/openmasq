/**
 * The full "OpenMasq conversation → CLI" turn: the composition of `bridge.ts`
 * (flatten the history) and `engine.ts` (spawn + streaming), with the
 * FAIL-CLOSED refusals that must precede any spawn.
 *
 * A FRESH session on every turn (a disposable UUID): that's the choice documented in
 * `CLAUDE.md` — OpenMasq remains the source of truth for its conversation, the CLI
 * keeps no state between two turns.
 */
import { randomUUID } from "node:crypto";
import type { ChatMessage, StreamDone } from "@openmasq/llm";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";
import { streamClaudeSubscription } from "./engine";
import { codexPrompt, streamCodexSubscription } from "./codexEngine";

export interface SubscriptionTurnEnv {
  /** Which CLI serves this turn (routed by `desktop.ts` from the provider).
   *  ABSENT = `claude`, the historic entry — both the text turn and the TOOLED turn
   *  (`toolsTurn.ts`) fall back to it. */
  cli?: "claude" | "codex";
  /** The name shown in refusals ("Claude Code", "Codex"). Absent ⇒ Claude Code. */
  label?: string;
  /** Absolute path to the binary, already resolved (`resolveCli`). */
  binPath: string;
  /** DEDICATED and neutral working directory — never a user folder. */
  cwd: string;
}

export interface SubscriptionTurnOptions {
  messages: ChatMessage[];
  /** The REGISTRY id of the chosen model (`claude-cli`, `claude-cli-sonnet`, …) — translated
   *  into a CLI alias by `cliModelAlias`. Absent/unknown ⇒ the subscription default. */
  modelId?: string;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
}

/**
 * Registry id → the CLI's `--model` alias. Bare `claude-cli` = NO flag (the subscription's
 * default — the historic behaviour, and what conversations already pinned to it
 * are served by); `claude-cli-<family>` = the family alias (`sonnet`/`opus`/
 * `haiku`), which the CLI resolves to that family's CURRENT model. An unexpected id
 * returns `undefined` rather than an invented alias — the default, never a CLI error.
 * ⚠️ Opus depends on the plan (absent from the Pro plan): the CLI then refuses the turn and
 * its message surfaces as-is via `chat:error`.
 */
export function cliModelAlias(modelId: string | undefined): string | undefined {
  const alias = modelId?.startsWith("claude-cli-") ? modelId.slice("claude-cli-".length) : "";
  return ["sonnet", "opus", "haiku"].includes(alias) ? alias : undefined;
}

/**
 * A chat turn over the subscription. Same shape as `streamChat` (deltas streamed
 * along the way, `StreamDone` as the return value) so that `chat:start`'s
 * routing is a simple choice of iterator.
 *
 * Refusals throw BEFORE the spawn, in French — the message surfaces as-is to the
 * renderer via `chat:error`:
 * - attachments: the headless CLI takes text, not image blocks. Silently
 *   dropping them would make the model "ignore" a document.
 * - empty turn: never spawn for nothing.
 */
export async function* streamSubscriptionTurn(
  env: SubscriptionTurnEnv,
  opts: SubscriptionTurnOptions,
): AsyncGenerator<string, StreamDone> {
  if (hasUnsupportedAttachments(opts.messages)) {
    throw new Error(
      `Le modèle « ${env.label ?? "Claude Code"} » ne prend pas encore les pièces jointes — ` +
        "envoyez du texte, ou choisissez un modèle avec vision.",
    );
  }
  const { system, prompt } = flattenForCli(opts.messages);
  if (!prompt) throw new Error("Rien à envoyer : la conversation ne contient aucun message.");

  if (env.cli === "codex") {
    return yield* streamCodexSubscription({
      binPath: env.binPath,
      prompt: codexPrompt(system, prompt),
      cwd: env.cwd,
      signal: opts.signal,
    });
  }

  return yield* streamClaudeSubscription({
    binPath: env.binPath,
    prompt,
    system,
    model: cliModelAlias(opts.modelId),
    sessionId: randomUUID(),
    cwd: env.cwd,
    signal: opts.signal,
    onReasoning: opts.onReasoning,
  });
}
