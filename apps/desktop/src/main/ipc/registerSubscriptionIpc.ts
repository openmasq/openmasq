import { handle } from "./handle";
import { claudeCliPath, subscriptionCliPath } from "../subscription/desktop";

/**
 * The SUBSCRIPTION family — one question per CLI: « is it installed here? ». This is
 * what makes `claude-cli` / `codex-cli` / `antigravity-cli` appear (or not) in the
 * pickers.
 *
 * The renderer only ever receives a BOOLEAN: never the binary's path (no reason
 * to describe the disk to it), and the probe SPAWNS nothing — a few `access()` calls on
 * known roots (`resolveCli`). Auth itself is only observed in use: a CLI
 * installed but never connected fails on the first send, with its own message.
 */
export function registerSubscriptionIpc(): void {
  handle("subscription:cli-available", [], () => claudeCliPath() !== null);
  handle("subscription:codex-available", [], () => subscriptionCliPath("codex") !== null);
  handle("subscription:antigravity-available", [], () => subscriptionCliPath("antigravity") !== null);
}
