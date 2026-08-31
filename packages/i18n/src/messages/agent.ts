/**
 * La prose que la BOUCLE AGENTIQUE adresse au modèle et dont la SORTIE est lue par
 * l'utilisateur.
 *
 * ⚠️ C'est la seule prose model-facing qui entre dans ce catalogue, et la raison est
 * précise : le reste (`send/inboundScreen.ts`, `agent/`, `prompt/`) suit la langue de la
 * CONVERSATION, où la traduire serait un contresens — mais ici la phrase produite
 * s'affiche dans la CHROME, pendant l'attente, à côté d'étiquettes qui suivent
 * l'interface. Demander une phrase française sous une interface anglaise donnait une
 * ligne française au milieu de l'anglais.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface AgentMessages {
  /** La consigne qui fait résumer un appel d'outil en une ligne montrable. */
  toolIntentSystem: string;
}
