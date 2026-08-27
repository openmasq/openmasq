/**
 * La moitié LIÉE À ELECTRON du moteur d'abonnement : où sont les CLI sur CETTE
 * machine, dans quel répertoire neutre elles travaillent, et l'aiguillage
 * fournisseur → CLI. Tenue à part pour que `turn.ts` / `engine.ts` / `bridge.ts`
 * restent purs et testables sans Electron.
 */
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveCli, type SubscriptionCliId } from "./resolveCli";
import type { SubscriptionTurnEnv } from "./turn";

/** Fournisseur du catalogue → CLI d'abonnement, ou `null` (pas un chemin CLI). */
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
 * Le binaire d'une CLI, ou `null` (état NORMAL : non installée — l'UI le montre comme
 * une invite, jamais comme une erreur). Résolu à CHAQUE appel, pas mis en cache : la
 * sonde est quelques `access()` et l'utilisateur peut l'installer pendant que l'app
 * tourne.
 */
export function subscriptionCliPath(cli: SubscriptionCliId): string | null {
  return resolveCli(cli, {
    platform: process.platform,
    home: app.getPath("home"),
    path: process.env.PATH,
  });
}

/** Compat : la sonde IPC historique (`subscription:cli-available`) vise claude. */
export function claudeCliPath(): string | null {
  return subscriptionCliPath("claude");
}

/**
 * Répertoire de travail dédié PAR CLI, sous `userData` — JAMAIS un dossier de projet
 * de l'utilisateur : une CLI y chercherait réglages et fichiers de contexte.
 */
function subscriptionCwd(cli: SubscriptionCliId): string {
  const dir = join(app.getPath("userData"), "subscription-chat", cli);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** L'environnement d'un tour, ou une erreur EXPLIQUÉE si la CLI manque (fail-closed). */
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
