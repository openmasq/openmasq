// La garde « RÉDIGER ≠ ENVOYER », extraite de `mcpAgentClassify.ts` pour le garder sous
// le plafond de 300 lignes (règle 1). Réexportée là-bas, donc invisible des importateurs —
// le même motif que `mcpAgentGuidance.ts` → `mcpAgentPython.ts`.

/**
 * « RÉDIGER » n'est pas « ENVOYER » — la garde déterministe.
 *
 * Journal du 26/07/2026 : « Rédige un email de remerciement à … » et un petit modèle
 * appelle `gmail__send_email` séance tenante. En mode de confirmation `standard` aucune
 * carte ne s'ouvre tant que la conversation n'a pas touché le web — l'email PARTAIT.
 *
 * Le prompt système le dit déjà, mais un prompt est une prière, pas une garantie : un
 * envoi est irréversible, donc la boucle le refuse ELLE-MÊME, quel que soit le mode de
 * confirmation. La garde est volontairement étroite dans les deux sens — elle n'agit que
 * sur les outils d'ENVOI, et seulement quand la demande porte un verbe de RÉDACTION sans
 * verbe d'envoi. « Envoie un email… » passe.
 */
const SEND_TOOL = /(^|_)(send|post|reply|forward)_(email|mail|message|messages|dm|sms)\b|(^|_)send_(email|mail|message)$/i;

export function isSendTool(name: string): boolean {
  return SEND_TOOL.test(name.replace(/^[a-z0-9-]+__/i, ""));
}

/** Verbes de RÉDACTION (produire un texte) et verbes d'ENVOI (le faire partir). */
// ⚠️ Frontières en lookaround Unicode, jamais `\b` : `\b` est ASCII, donc « Écris » en
// tête de phrase n'ouvrait aucune frontière et la garde ne se déclenchait pas.
// Définition partagée : `send/wordEdges.ts` (règle 9).
import { EDGE_L, EDGE_R } from "../send/wordEdges";
const DRAFT_VERB = new RegExp(
  `${EDGE_L}(r[ée]dige|r[ée]diger|[ée]cris|[ée]crire|pr[ée]pare|pr[ée]parer|compose|composer|` +
    `propose|proposer|formule|formuler|draft|write)${EDGE_R}`,
  "iu",
);
const SEND_VERB = new RegExp(
  `${EDGE_L}(envoie|envoie-le|envoyer|envoi|transmets|transmettre|exp[ée]die|exp[ée]dier|` +
    `poste|poster|send|deliver)${EDGE_R}`,
  "iu",
);

/**
 * Une INTERDICTION explicite d'envoyer. Elle contient le verbe d'envoi, ce qui a retourné
 * la garde contre son objet : « N'envoie rien : montre-moi d'abord. » contenait « envoie »,
 * donc la demande se lisait comme un ordre d'envoi — et l'e-mail est parti (journal du
 * 27/07/2026). La négation est donc traitée AVANT, et elle est SUFFISANTE : dire « n'envoie
 * rien » n'oblige à aucun verbe de rédaction pour être respecté.
 */
const NO_SEND = new RegExp(
  `${EDGE_L}(?:n['’ ]?(?:e[ ]?)?(?:les[ ]?|le[ ]?|lui[ ]?)?envoie|n['’ ]?envoyez|ne[ ](?:rien[ ])?envoyer|` +
    `sans[ ](?:rien[ ])?envoyer|pas[ ]d['’]envoi|ne[ ]pas[ ]envoyer|` +
    `do[ ]?n['’]?t[ ]send|do[ ]not[ ]send|without[ ]sending)`,
  "iu",
);

/**
 * La demande réclame-t-elle un BROUILLON plutôt qu'un envoi ?
 *
 * Trois cas, dans cet ordre — l'ordre EST la règle :
 *  1. une interdiction explicite d'envoyer ⇒ oui, quoi qu'il y ait d'autre dans le message ;
 *  2. sinon, un verbe d'envoi ⇒ non (sur-bloquer un « envoie » explicite serait aussi grave
 *     que laisser partir un « rédige ») ;
 *  3. sinon, un verbe de rédaction ⇒ oui.
 */
export function asksDraftNotSend(text: string | undefined | null): boolean {
  if (!text) return false;
  if (NO_SEND.test(text)) return true;
  return DRAFT_VERB.test(text) && !SEND_VERB.test(text);
}

/** Ce que le modèle reçoit à la place du résultat d'envoi : la consigne, pas une erreur. */
export const DRAFT_NOT_SEND_STEER =
  "Envoi REFUSÉ : l'utilisateur a demandé de RÉDIGER, pas d'ENVOYER. L'e-mail n'est PAS " +
  "parti. Présente le texte rédigé dans la conversation (bloc document) et laisse " +
  "l'utilisateur décider de l'envoyer. Ne rappelle aucun outil d'envoi sans une demande " +
  "explicite (« envoie », « transmets »).";

