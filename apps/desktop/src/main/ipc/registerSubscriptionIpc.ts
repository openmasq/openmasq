import { handle, str } from "./handle";
import { readSubscriptionAccount } from "../subscription/account";
import { claudeCliPath, subscriptionCliPath, subscriptionTurnEnv } from "../subscription/desktop";
import type { SubscriptionCliId } from "../subscription/resolveCli";

/**
 * The SUBSCRIPTION family — one question per CLI: « is it installed here? ». This is
 * what makes `claude-cli` / `codex-cli` / `antigravity-cli` appear (or not) in the
 * pickers.
 *
 * The renderer only ever receives a BOOLEAN: never the binary's path (no reason
 * to describe the disk to it), and the probe SPAWNS nothing — a few `access()` calls on
 * known roots (`resolveCli`). Auth itself is only observed in use: a CLI
 * installed but never connected fails on the first send, with its own message.
 *
 * `subscription:account` is the ONE call that does spawn: the CLI's own account read
 * (plan, quota, models — `subscription/account.ts`), on the user's gesture (opening the
 * agent's card), bounded, and `null` when the CLI is absent or silent — a normal state.
 */
const CLIS: readonly SubscriptionCliId[] = ["claude", "codex", "antigravity"];

export function registerSubscriptionIpc(): void {
  handle("subscription:cli-available", [], () => claudeCliPath() !== null);
  handle("subscription:codex-available", [], () => subscriptionCliPath("codex") !== null);
  handle("subscription:antigravity-available", [], () => subscriptionCliPath("antigravity") !== null);
  handle("subscription:account", [str], async (_e, cli) => {
    if (!CLIS.includes(cli as SubscriptionCliId)) return null;
    let env: ReturnType<typeof subscriptionTurnEnv>;
    try {
      env = subscriptionTurnEnv(cli as SubscriptionCliId);
    } catch {
      return null; // CLI not installed: nothing to read, nothing to report
    }
    return readSubscriptionAccount(env.cli ?? "claude", env.binPath, env.cwd);
  });
}
