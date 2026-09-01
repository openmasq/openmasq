/**
 * The ELECTRON-BOUND half of the subscription engine: where the CLIs are on THIS
 * machine, which neutral directory they work in, and the provider → CLI
 * switchboard. Kept apart so `turn.ts` / `engine.ts` / `bridge.ts`
 * stay pure and testable without Electron.
 */
import { app } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANTIGRAVITY_APP_DATA_DIR, ANTIGRAVITY_SETTINGS } from "./antigravityEngine";
import { resolveCli, type SubscriptionCliId } from "./resolveCli";
import type { SubscriptionTurnEnv } from "./turn";

/** Catalog provider → subscription CLI, or `null` (not a CLI path). */
export function subscriptionCliFor(provider: string): SubscriptionCliId | null {
  if (provider === "claude-cli") return "claude";
  if (provider === "codex-cli") return "codex";
  if (provider === "antigravity-cli") return "antigravity";
  return null;
}

/**
 * The same question for the TOOLED turn — and it is NOT the same list. `antigravity` is
 * absent BY DESIGN, on two measurements (`antigravityEngine.ts`): its CLI reads MCP
 * servers only from the user's GLOBAL config (so the app's bridge could not be this
 * turn's only server without writing into their config and leaking a loopback server
 * into their other sessions), and it advertises its ~50 built-in tools whatever the
 * flags (so `toolGate`'s perimeter can't hold). `null` ⇒ the caller keeps its normal
 * path, and the app's connectors are simply not offered on that model — fail-closed,
 * rather than a bridge whose guarantees we cannot state.
 */
export function subscriptionToolsCli(provider: string): SubscriptionCliId | null {
  const cli = subscriptionCliFor(provider);
  return cli === "antigravity" ? null : cli;
}

const CLI_LABEL: Record<SubscriptionCliId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  antigravity: "Antigravity",
};

/**
 * The binary for a CLI, or `null` (NORMAL state: not installed — the UI shows it as
 * a prompt, never as an error). Resolved on EVERY call, not cached: the
 * probe is a few `access()` calls and the user can install it while the app
 * is running.
 */
export function subscriptionCliPath(cli: SubscriptionCliId): string | null {
  return resolveCli(cli, {
    platform: process.platform,
    home: app.getPath("home"),
    path: process.env.PATH,
  });
}

/** Compat: the legacy IPC probe (`subscription:cli-available`) targets claude. */
export function claudeCliPath(): string | null {
  return subscriptionCliPath("claude");
}

/**
 * Dedicated working directory PER CLI, under `userData` — NEVER a user
 * project folder: a CLI would look there for settings and context files.
 */
function subscriptionCwd(cli: SubscriptionCliId): string {
  const dir = join(app.getPath("userData"), "subscription-chat", cli);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const CLI_MISSING: Record<SubscriptionCliId, string> = {
  claude:
    "La CLI Claude Code est introuvable sur cette machine. Installez-la et " +
    "connectez-la à votre abonnement Claude, ou choisissez un autre modèle.",
  codex:
    "La CLI Codex est introuvable sur cette machine. Installez-la " +
    "(`npm i -g @openai/codex`), connectez-la à votre compte ChatGPT " +
    "(`codex login`), ou choisissez un autre modèle.",
  antigravity:
    "La CLI Antigravity (`agy`) est introuvable sur cette machine. Installez " +
    "Antigravity, connectez-la à votre compte Google, ou choisissez un autre modèle.",
};

/**
 * The Antigravity CLI's ISOLATED data folder, and the settings written into it before
 * every turn. The `--app_data_dir` flag only accepts a RELATIVE path (resolved under
 * `~/.gemini`, measured): this folder therefore cannot live in `userData` like the cwd.
 * What is written there — EMPTY permissions — is what holds the isolation: with no allow
 * rule, headless mode refuses any tool that needs one, and the rules the user set for
 * THEIR own sessions do not apply here. Rewritten on every turn (idempotent) so that a
 * hand edit never leaves a permission behind.
 */
function prepareAntigravityAppData(): void {
  const dir = join(app.getPath("home"), ".gemini", ANTIGRAVITY_APP_DATA_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), JSON.stringify(ANTIGRAVITY_SETTINGS, null, 2));
}

/** A turn's environment, or an EXPLAINED error if the CLI is missing (fail-closed). */
export function subscriptionTurnEnv(cli: SubscriptionCliId = "claude"): SubscriptionTurnEnv {
  const binPath = subscriptionCliPath(cli);
  if (!binPath) throw new Error(CLI_MISSING[cli]);
  if (cli === "antigravity") prepareAntigravityAppData();
  return { cli, label: CLI_LABEL[cli], binPath, cwd: subscriptionCwd(cli) };
}
