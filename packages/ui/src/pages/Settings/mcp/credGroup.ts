import { connectorIdFromInstance } from "@openmasq/catalog/mcp";
import type { McpItem } from "./mcpItems";

/**
 * Le GROUPE d'identifiants d'un connecteur — c'est-à-dire ce qui tombe ENSEMBLE.
 *
 * Les connecteurs Google (Gmail, Agenda, Drive, Docs, Sheets, Tasks, Analytics) partagent
 * UN SEUL client OAuth « Desktop app », donc une seule autorisation côté Google. Ils
 * partagent le groupe « google » et se prêtent leurs clés ; tout autre connecteur est son
 * propre groupe.
 *
 * ⚠️ **La panne est de groupe, la réparation ne l'est pas.** `mcpReauthDirect` (main)
 * purge et re-consent UN id : `clearToken(id)` puis `connectServer(id)`. Quand
 * l'autorisation Google expire ou est révoquée, les sept connecteurs tombent ensemble,
 * mais reconnecter Gmail ne remet à neuf que Gmail — Agenda et Drive restent cassés, et
 * rien ne le disait. D'où `groupPeers` : la fiche NOMME les autres et propose de les
 * reconnecter aussi.
 *
 * Pourquoi ne pas tout re-consentir d'un geste (l'autre option envisagée) : Google
 * demanderait alors le consentement pour l'UNION des scopes des sept services, sur des
 * scopes RESTRICTED. Réparer son courrier ne doit pas exiger d'accorder Drive.
 */
export function credGroupOf(id: string): string {
  const connectorId = connectorIdFromInstance(id);
  return /^(gmail|google-)/.test(connectorId) ? "google" : connectorId;
}

/** Vrai quand le groupe peut contenir PLUSIEURS connecteurs (aujourd'hui : Google seul).
 *  Un groupe d'un seul connecteur n'a rien à annoncer. */
export function isSharedCredGroup(id: string): boolean {
  return credGroupOf(id) !== connectorIdFromInstance(id);
}

/**
 * Les AUTRES connecteurs du même groupe d'identifiants, parmi ceux que l'utilisateur a
 * réellement connectés — ce sont eux que la même autorisation a fait tomber.
 *
 * Bornée à ce qui est CONNECTÉ : nommer un service que l'utilisateur n'utilise pas
 * transformerait une réparation en catalogue. Et l'ordre suit `items`, donc l'ordre du
 * catalogue, pour que la phrase soit stable d'une ouverture à l'autre.
 */
export function groupPeers(id: string, items: readonly McpItem[]): McpItem[] {
  const connectorId = connectorIdFromInstance(id);
  if (!isSharedCredGroup(connectorId)) return [];
  const group = credGroupOf(connectorId);
  return items.filter((it) => it.id !== connectorId && it.connected && credGroupOf(it.id) === group);
}
