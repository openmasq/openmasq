/**
 * The ELECTRON-BOUND half of the subscription engine: where the CLIs are on THIS
 * machine, which neutral directory they work in, and the provider → CLI
 * switchboard. Kept apart so `turn.ts` / `engine.ts` / `bridge.ts`
 * stay pure and testable without Electron.
 */
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveCli, type SubscriptionCliId } from "./resolveCli";
import type { SubscriptionTurnEnv } from "./turn";

/** Catalog provider → subscription CLI, or `null` (not a CLI path). */
export function subscriptionCliFor(provider: string): SubscriptionCliId | null {
  if (provider === "claude-cli") return "claude";
  if (provider === "codex-cli") return "codex";
  return null;
}

const CLI_LABEL: Record<SubscriptionCliId, string> = {
  claude: "Claude Code",
  codex: "Codex",
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

/** A turn's environment, or an EXPLAINED error if the CLI is missing (fail-closed). */
export function subscriptionTurnEnv(cli: SubscriptionCliId = "claude"): SubscriptionTurnEnv {
  const binPath = subscriptionCliPath(cli);
  if (!binPath) {
    throw new Error(
      cli === "claude"
        ? "La CLI Claude Code est introuvable sur cette machine. Installez-la et " +
          "connectez-la à votre abonnement Claude, ou choisissez un autre modèle."
        : "La CLI Codex est introuvable sur cette machine. Installez-la " +
          "(`npm i -g @openai/codex`), connectez-la à votre compte ChatGPT " +
          "(`codex login`), ou choisissez un autre modèle.",
    );
  }
  return { cli, label: CLI_LABEL[cli], binPath, cwd: subscriptionCwd(cli) };
}
