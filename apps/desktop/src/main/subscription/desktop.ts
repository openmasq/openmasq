/**
 * La moitié LIÉE À ELECTRON du moteur d'abonnement : où est la CLI sur CETTE
 * machine, et dans quel répertoire neutre elle travaille. Tenue à part pour que
 * `turn.ts` / `engine.ts` / `bridge.ts` restent purs et testables sans Electron.
 */
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveCli } from "./resolveCli";
import type { SubscriptionTurnEnv } from "./turn";

/**
 * Le binaire `claude`, ou `null` (état NORMAL : CLI non installée — l'UI le montre
 * comme une invite, jamais comme une erreur). Résolu à CHAQUE appel, pas mis en
 * cache : la sonde est quelques `access()` et l'utilisateur peut installer la CLI
 * pendant que l'app tourne.
 */
export function claudeCliPath(): string | null {
  return resolveCli("claude", {
    platform: process.platform,
    home: app.getPath("home"),
    path: process.env.PATH,
  });
}

/**
 * Répertoire de travail dédié, sous `userData` — JAMAIS un dossier de projet de
 * l'utilisateur : la CLI y chercherait réglages et fichiers de contexte.
 */
export function subscriptionCwd(): string {
  const dir = join(app.getPath("userData"), "subscription-chat");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** L'environnement d'un tour, ou une erreur EXPLIQUÉE si la CLI manque (fail-closed). */
export function subscriptionTurnEnv(): SubscriptionTurnEnv {
  const binPath = claudeCliPath();
  if (!binPath) {
    throw new Error(
      "La CLI Claude Code est introuvable sur cette machine. Installez-la et " +
        "connectez-la à votre abonnement Claude, ou choisissez un autre modèle.",
    );
  }
  return { binPath, cwd: subscriptionCwd() };
}
