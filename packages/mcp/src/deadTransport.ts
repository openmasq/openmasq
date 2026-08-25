/**
 * « Ce serveur MCP est MORT » — le fait, à un seul endroit.
 *
 * Le SDK ne modélise pas la mort d'un transport : il la signale en JETANT, et toujours par
 * l'un de ces deux textes. Deux décisions distinctes en dépendent, et elles doivent parler
 * du même ensemble :
 *  • le propriétaire de la connexion ÉVINCE le serveur au lieu de continuer à le sonder
 *    (`apps/desktop` `refreshRoutes`) ;
 *  • les canaux d'erreurs ne rapportent pas la panne (c'est un connecteur distant tombé ou
 *    un enfant sorti, pas un bug de code).
 *
 * ⚠️ La seconde vit forcément ailleurs : `@openmasq/analytics` est SANS DÉPENDANCE par
 * contrat, il ne peut pas importer ce paquet. Sa liste est donc plus large (réseau, refus
 * d'auth…) et l'inclusion des deux messages ci-dessous est tenue par un TEST qui lit les
 * deux — `packages/ui/src/analytics/deadTransportParity.test.ts`, le seul consommateur des
 * deux paquets. Un commentaire ne peut pas échouer en CI (règle 9).
 *
 * Le texte est celui du SDK, pas le nôtre : le durcir en `RegExp` gourmande éviscérerait la
 * distinction qui compte. Un `spawn ENOENT` ou un « cannot find module » est une régression
 * d'EMPAQUETAGE, il doit continuer de remonter.
 */

/** Les messages par lesquels le SDK dit qu'il n'y a plus personne au bout. */
export const DEAD_TRANSPORT_MESSAGES = ["not connected", "connection closed"] as const;

/**
 * L'erreur dit-elle que le transport est mort ? Lâche sur la FORME (une `Error`, un
 * `McpError`, une chaîne — le SDK jette les trois selon le chemin), strict sur le FOND.
 */
export function isDeadTransport(err: unknown): boolean {
  const text = (
    err instanceof Error ? err.message : typeof err === "string" ? err : ""
  ).toLowerCase();
  if (!text) return false;
  return DEAD_TRANSPORT_MESSAGES.some((m) => text.includes(m));
}
