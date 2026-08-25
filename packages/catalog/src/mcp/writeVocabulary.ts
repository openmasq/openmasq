/**
 * LE vocabulaire lecture-vs-écriture des noms d'outils MCP — et LE classifieur qui le lit.
 *
 * Une seule maison (règle 9) parce qu'il y a DEUX frontières qui doivent juger pareil :
 * la boucle agentique du renderer (`@openmasq/ui` `isWriteTool` — l'UX de confirmation)
 * et le write-gate du process main (`apps/desktop` `isWriteToolName` — la frontière
 * réelle, celle qu'un XSS renderer ne peut pas contourner). Les deux copies avaient
 * dérivé : des listes de verbes disjointes, un ancrage différent, et des DÉFAUTS opposés
 * (l'UI laissait passer un nom inconnu, main le bloquait). Le défaut unifié est celui de
 * main : **inconnu ⇒ ÉCRITURE** (fail closed, règle 7) — un outil dont le nom ne dit
 * rien peut muter, donc il se confirme.
 *
 * Les quatre expressions se lisent ensemble ou pas du tout : `WRITE_VERB` est large et
 * collisionne avec des noms (`get_issue`, `get_run`), ce que `DESTRUCTIVE_VERB` et
 * `COMPOUND_WRITE` rattrapent, et `READ_VERB` n'est un ancrage de confiance que parce
 * qu'il est en TÊTE (`^`) — sans l'ancre, `delete_read_receipts` passerait pour une
 * lecture. Modifier l'une sans relire les autres, c'est ouvrir un chemin.
 */

/** Un verbe de LECTURE — ancré en TÊTE (`^`) : la tête du nom est la commande, et c'est
 *  le seul endroit où un verbe de lecture est une preuve de confiance. */
export const READ_VERB =
  /^(search|list|get|read|fetch|retrieve|find|lookup|describe|details?|query|count|download|export|check|view|show|preview|inspect|browse|scan)\b/i;

/** Un verbe d'ÉCRITURE, n'importe où dans le nom. Volontairement LARGE (l'union des deux
 *  anciennes listes UI + main) : un token de cette liste dans un nom sans préfixe de
 *  lecture suffit à confirmer. */
export const WRITE_VERB =
  /\b(write|create|update|modify|edit|delete|remove|destroy|post|put|patch|send|refund|charge|cancel|insert|upsert|upload|add|set|archive|rename|move|publish|deploy|revoke|pay|transfer|issue|capture|void|execute|run|apply|merge|drop|truncate|migrate|grant|approve|provision|terminate|restore|purge|wipe|replace|disable|enable|assign|invite|share)\b/i;

/** Verbes destructeurs NON ambigus (audit H-5) : jamais un nom d'objet de lecture
 *  (contrairement à `issue`/`run`/`post` de WRITE_VERB), donc un de ces verbes N'IMPORTE
 *  OÙ l'emporte sur un préfixe de lecture — `get_and_purge`, `delete_read_receipts`. */
export const DESTRUCTIVE_VERB =
  /\b(delete|remove|destroy|drop|truncate|purge|erase|wipe|revoke|terminate|deprovision|deregister|unpublish|unlink|detach|disable|deactivate|refund|chargeback|cancel|void|overwrite|reset|uninstall|kill|expire)\b/i;

/** Une commande COMPOSÉE — verbe de lecture, CONJONCTION, verbe d'écriture
 *  (`get_and_send_email`, `list_then_charge`). La conjonction distingue « deux
 *  commandes » d'une lecture d'objet au nom d'écriture (`get_issue` n'en a pas). */
export const COMPOUND_WRITE = new RegExp(
  `\\b(?:and|then|plus)\\b[\\w\\s]*?${WRITE_VERB.source}`,
  "i",
);

/** Verbe de lecture n'importe où — la preuve FAIBLE, acceptée seulement quand le nom ne
 *  porte AUCUNE preuve d'écriture (voir le classifieur). Dérivé de READ_VERB (une seule
 *  liste), l'ancre `^` en moins. */
const READ_ANYWHERE = new RegExp(`\\b(?:${READ_VERB.source.slice(1)})`, "i");

/** Les verbes de `WRITE_VERB` qui NOMMENT tout aussi couramment une LECTURE :
 *  `execute-sql`, `run-query`, `run-report`. Sous-ensemble strict, tenu court exprès —
 *  `apply`/`issue`/`capture`/`post` n'y sont PAS : leur usage lecture est marginal et le
 *  bénéfice ne vaut pas le risque. Ne sert qu'à `isAmbiguousWrite` ci-dessous. */
export const AMBIGUOUS_WRITE_VERB = /\b(execute|run)\b/i;

export interface ToolWriteAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

/**
 * Un outil est-il une ÉCRITURE (⇒ confirmation) ?
 *
 * Une annotation serveur ne peut qu'AUGMENTER le soupçon, jamais le baisser (un serveur
 * compromis marquerait tout `readOnlyHint:true` pour sauter le dialogue) — un
 * `readOnlyHint:true` nu ne sert que de départage pour un nom GÉNÉRIQUE. Puis le nom :
 * un verbe destructeur n'importe où confirme AVANT le court-circuit lecture ; un préfixe
 * de lecture sans commande composée est une lecture ; un verbe d'écriture confirme ; un
 * verbe de lecture n'importe où avec ZÉRO preuve d'écriture est une lecture (le cas
 * `stripe_api_read`, `notion__notion-fetch` — le vendeur répète son nom devant le verbe).
 * La description, même confiance qu'une annotation, ne départage qu'un nom générique.
 *
 * **Tout le reste ⇒ ÉCRITURE** (fail closed) : `notion-duplicate-page`, `issue`,
 * `customers` — un nom qui ne prouve pas la lecture se confirme.
 */
export function classifyToolWrite(
  name: string,
  annotations?: ToolWriteAnnotations,
  description?: string,
): boolean {
  if (annotations) {
    if (annotations.destructiveHint === true) return true;
    if (annotations.readOnlyHint === false) return true;
  }
  // Le client de redaction tamponne UN SEUL préfixe `${server}__` : la frontière du
  // connecteur est le PREMIER `__` (un `lastIndexOf` tronquerait un nom nu contenant `__`).
  const i = name.indexOf("__");
  const bare = i >= 0 ? name.slice(i + 2) : name;
  const words = bare.replace(/[_-]+/g, " ");
  // Destructeur n'importe où : AVANT le court-circuit lecture (H-5).
  if (DESTRUCTIVE_VERB.test(words)) return true;
  // Tête de lecture, pas de commande composée ⇒ lecture (get_issue reste une lecture).
  if (READ_VERB.test(words) && !COMPOUND_WRITE.test(words)) return false;
  if (WRITE_VERB.test(words)) return true;
  // Preuve faible : un verbe de lecture n'importe où, avec — établi ci-dessus — zéro
  // verbe d'écriture ni destructeur dans le nom (donc pas de composé possible).
  if (READ_ANYWHERE.test(words)) return false;
  // Nom générique : l'annotation puis la description départagent ; sinon fail closed.
  if (annotations?.readOnlyHint === true) return false;
  if (description) {
    if (WRITE_VERB.test(description) || DESTRUCTIVE_VERB.test(description)) return true;
    if (READ_ANYWHERE.test(description)) return false;
  }
  return true;
}

/**
 * Le verdict d'ÉCRITURE ne tient-il QU'À un verbe AMBIGU, contre une déclaration de
 * lecture seule du serveur ? (`posthog__execute-sql` + `readOnlyHint:true`.)
 *
 * ⚠️ Ceci ne rend PAS l'outil lisible : `classifyToolWrite` dit toujours écriture, donc
 * la confirmation reste EXIGÉE — un `readOnlyHint` usurpé ne peut rien exécuter en
 * silence. Ça ne lève qu'une chose : le refus AUTOMATIQUE en mode consultation. Sans
 * cette nuance, « regarde l'activité » refusait `execute-sql` sans rien demander à
 * personne, et l'unique outil capable de répondre devenait inatteignable pour TOUTE
 * question de lecture (journal du 15/08 : neuf tours, aucune réponse). Demander est le
 * bon compromis ; refuser d'office ne protégeait de rien, puisque la confirmation
 * protégeait déjà.
 *
 * Faux ⇒ comportement inchangé. Exigences cumulatives : le serveur DÉCLARE la lecture
 * seule, aucun verbe destructeur ni composé, et le verdict TOMBE si l'on retire les
 * verbes ambigus (sinon un autre verbe d'écriture le porte — `run_and_delete`).
 */
export function isAmbiguousWrite(
  name: string,
  annotations?: ToolWriteAnnotations,
  description?: string,
): boolean {
  if (annotations?.readOnlyHint !== true || annotations.destructiveHint === true) return false;
  if (!classifyToolWrite(name, annotations, description)) return false; // déjà une lecture
  const i = name.indexOf("__");
  const words = (i >= 0 ? name.slice(i + 2) : name).replace(/[_-]+/g, " ");
  if (DESTRUCTIVE_VERB.test(words) || COMPOUND_WRITE.test(words)) return false;
  if (!AMBIGUOUS_WRITE_VERB.test(words)) return false;
  // Le verbe ambigu doit être la SEULE cause : sans lui, plus de verdict d'écriture.
  const sansAmbigu = words.replace(new RegExp(AMBIGUOUS_WRITE_VERB.source, "gi"), " ");
  return !WRITE_VERB.test(sansAmbigu);
}
