import { handle } from "./handle";
import { claudeCliPath, subscriptionCliPath } from "../subscription/desktop";

/**
 * La famille ABONNEMENT — aujourd'hui une seule question : « la CLI Claude Code
 * est-elle installée ici ? ». C'est ce qui fait apparaître (ou pas) le modèle
 * `claude-cli` dans les sélecteurs.
 *
 * Le renderer ne reçoit qu'un BOOLÉEN : jamais le chemin du binaire (aucune raison
 * de lui décrire le disque), et la sonde ne SPAWN rien — quelques `access()` sur
 * des racines connues (`resolveCli`). L'auth, elle, se constate à l'usage : une CLI
 * installée mais jamais connectée échoue au premier envoi, avec son message.
 */
export function registerSubscriptionIpc(): void {
  handle("subscription:cli-available", [], () => claudeCliPath() !== null);
  handle("subscription:codex-available", [], () => subscriptionCliPath("codex") !== null);
}
