import { connectorIdFromInstance } from "@openmasq/catalog/mcp";

/**
 * La décision « cette organisation autorise-t-elle ce connecteur ? », en UN endroit.
 *
 * Elle vit ici et pas dans l'agent ni dans les réglages parce que les DEUX la prenaient,
 * chacun avec sa propre normalisation d'identifiant — et elles avaient déjà divergé :
 * les réglages ne connaissaient pas les instances multi-comptes (`gmail--a1b2`), donc un
 * connecteur refusé restait déverrouillé dès qu'il portait un second compte. Un
 * comportement copié « pour garder la même forme » est le même bug avec plus de surface
 * (règle 9) : le point de variation légitime est ce qu'on FAIT du refus, pas comment on
 * le calcule.
 *
 * ⚠️ Sémantique de liste d'AUTORISATION, et les deux absences ne disent pas la même
 * chose : `undefined` = pas d'organisation (compte solo, tout est permis) ; `[]` = compte
 * géré dont l'organisation n'a encore rien ouvert, donc RIEN n'est permis. Lire les deux
 * pareil transforme l'allow-list en liste de refus, ce que la règle 7 interdit.
 */
export function isConnectorAllowed(id: string | undefined, allowedIds: string[] | undefined): boolean {
  if (!allowedIds) return true; // pas d'organisation
  if (!id) return false; // un identifiant inconnu ne s'autorise pas
  const allowed = new Set(allowedIds);
  // Un serveur vivant s'annonce `broker-<id>` / `local-<id>` ; une instance
  // multi-comptes `<id>--<hash>`. La politique, elle, est écrite en ids de catalogue.
  const bare = id.replace(/^(broker|local)-/, "");
  return (
    allowed.has(id) ||
    allowed.has(bare) ||
    allowed.has(connectorIdFromInstance(id)) ||
    allowed.has(connectorIdFromInstance(bare))
  );
}

/** Le miroir pour les modèles. Même distinction absent/vide, même raison. */
export function isModelAllowed(id: string | undefined, allowedIds: string[] | undefined): boolean {
  if (!allowedIds) return true;
  return !!id && allowedIds.includes(id);
}
