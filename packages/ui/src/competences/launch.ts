import { findConnector } from "@openmasq/catalog/mcp";
import type { Competence } from "../types";

/**
 * CE QU'UNE COMPÉTENCE FAIT AU MOMENT OÙ ON S'EN SERT — le texte qu'elle ajoute au
 * payload du modèle, et la portée d'outils qu'elle ouvre.
 *
 * Séparé de `competences.ts` (qui ne sait que ranger une liste) parce que c'est ici
 * qu'est la seule règle de comportement du produit :
 *
 * > **Une compétence qui nomme des connecteurs les utilise.**
 *
 * Sans `servers`, tout ce qui suit est inerte : le prompt part nu, la portée d'outils du
 * tour est celle de d'habitude. C'est ce qui rend la fusion des deux anciennes listes
 * sans perte — ce que l'app appelait « workflow » était une compétence dont `servers`
 * n'est pas vide, et rien d'autre.
 */

/** Presentation shape for one of a compétence's MCP servers (chips, avatars). */
export interface CompetenceServerMeta {
  id: string;
  name: string;
  /** Design-system hue name (`--hl-*`), defaulted when the catalog has none. */
  tone: string;
}

/** Catalog lookup with a graceful degrade: an id the registry no longer knows
 *  (a renamed connector in an old saved entry) still renders as itself. */
export function competenceServerMeta(id: string): CompetenceServerMeta {
  const c = findConnector(id);
  return { id, name: c?.name ?? id, tone: c?.tone ?? "violet" };
}

export function competenceServers(c: Pick<Competence, "servers">): CompetenceServerMeta[] {
  return (c.servers ?? []).map(competenceServerMeta);
}

/** True quand la compétence pilote des outils — le seul test qui décide d'un
 *  comportement différent, partout. */
export function drivesTools(c: Pick<Competence, "servers">): boolean {
  return (c.servers ?? []).length > 0;
}

/**
 * Les VALEURS À RENSEIGNER d'un prompt : `{date}`, `{sujet}`, `{dépôt}`… C'est la
 * convention que la modale d'édition documente et que tous nos modèles de départ suivent
 * (`suggestions/competenceTemplates.ts`).
 *
 * Ordonnées à la première apparition, dédupliquées. Une accolade vide ou multi-ligne
 * n'en est pas une (`{}`, un bloc de code) et n'est pas retenue.
 */
export function promptSlots(prompt: string): string[] {
  const found = prompt.match(/\{([^{}\n]{1,60})\}/g) ?? [];
  const labels = found.map((m) => m.slice(1, -1).trim()).filter(Boolean);
  return [...new Set(labels)];
}

/** Combien de pastilles d'accolades le CHIP montre avant de replier en « +N ». */
const SLOT_PILLS_MAX = 4;

/**
 * Les pastilles à MONTRER sur le chip, et celles repliées derrière « +N » — un prompt
 * juridique/gabarit porte facilement 15-30 `{accolades}`, et une pastille par accolade
 * faisait exploser la rangée du composer (signalé 13/08). Le repli garde le rappel
 * (« des blancs à combler ») sans casser la mise en page ; la liste complète reste
 * lisible au survol (title) et dans l'aperçu du prompt.
 */
export function cappedSlots(slots: string[], max = SLOT_PILLS_MAX): { shown: string[]; hidden: string[] } {
  if (slots.length <= max) return { shown: slots, hidden: [] };
  return { shown: slots.slice(0, max), hidden: slots.slice(max) };
}

/**
 * The TEXT a used compétence prepends to the MODEL payload (`send/sendOrchestrator.ts`):
 * the prompt, plus — when it is scoped to servers — one guidance line naming the
 * connectors to use. This is what makes `servers` EFFECTIVE at execution (the agent
 * routes by the instruction), while staying honest: the SAME text is the staged chip's
 * hover-peek, so the user sees exactly what will be prepended — never an invisible
 * side-channel. Guidance for the model — the agent loop's tool gates are unchanged by it.
 *
 * ⚠️ Les `{accolades}` partent TELLES QUELLES sur le fil — c'est le dessin : elles se
 * renseignent dans le message que l'utilisateur écrit à côté du chip. Mais rien ne le
 * disait AU MODÈLE, qui recevait « Prépare ma journée du {date}. » sans la moindre
 * indication de ce qu'est `{date}` (journal du 27/07/2026, message utilisateur : « go »).
 * D'où la seconde ligne de guidance : elle nomme les valeurs, dit où les chercher, et
 * interdit d'en inventer une — c'est un blanc dans la demande, pas une donnée à combler.
 */
export function competenceLaunchText(c: Pick<Competence, "prompt" | "servers">): string {
  const names = competenceServers(c).map((s) => s.name);
  const slots = promptSlots(c.prompt);
  let out = c.prompt.trimEnd();
  if (names.length)
    out += `\n\n(Utilise ${names.length > 1 ? "les connecteurs" : "le connecteur"} : ${names.join(", ")}.)`;
  if (slots.length)
    out +=
      `\n\n(${slots.map((s) => `{${s}}`).join(", ")} ${slots.length > 1 ? "sont des valeurs" : "est une valeur"} ` +
      `à renseigner : déduis-${slots.length > 1 ? "les" : "la"} du message de l'utilisateur ou de la date du jour. ` +
      `Si ce n'est pas possible, DEMANDE — n'invente aucune valeur et ne recopie jamais les accolades.)`;
  return out;
}

/**
 * La portée de connecteurs en vigueur dans une conversation — celle déclarée par la
 * DERNIÈRE compétence à outils utilisée dedans.
 *
 * ⚠️ Une portée doit survivre à son propre premier message. Une routine qui pose une
 * question de clarification (« depuis quelle date ? ») y répond au tour SUIVANT, qui ne
 * porte aucune compétence — et la portée était lue de ce seul envoi, donc le routeur
 * élaguait le connecteur même que la routine nomme, son rattrapage ne partait pas, et le
 * modèle se retrouvait sans outil Gmail au tour exact qui en avait besoin (journal du
 * 02/08/2026). La donnée était sur le message depuis le début.
 *
 * Le dernier lancement GAGNE (une seconde routine remplace la première), et la portée ne
 * fait qu'ÉLARGIR les outils offerts — le plafond de budget et toutes les barrières à
 * l'appel sont inchangés — donc la reporter ne peut pas transformer un bon tour en tour
 * refusé.
 *
 * ⚠️ Lit les DEUX formes : `message.competence` (ce qu'on écrit) et `message.workflow`
 * (ce qui est déjà dans l'historique de tout le monde). Ne lire que la neuve, c'est
 * casser la reprise de portée de toutes les conversations existantes.
 */
export function activeCompetenceScope(
  messages: readonly {
    role: string;
    competence?: { servers?: string[] };
    workflow?: { servers?: string[] };
  }[],
): string[] | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const tag = m.competence ?? m.workflow;
    if (!tag) continue;
    // Une compétence SANS connecteur ne redéfinit rien : elle passe son tour, elle ne
    // referme pas une portée ouverte deux tours plus tôt. C'est ce que faisait déjà une
    // compétence d'avant la fusion (elle n'avait aucun effet sur les outils), et le seul
    // cas que ça déplace est un ex-workflow enregistré avec ZÉRO connecteur, qui fermait
    // la portée : ne plus la fermer ne fait qu'ÉLARGIR l'offre, ce que le plafond de
    // budget et les barrières à l'appel encadrent déjà.
    if (!tag.servers?.length) continue;
    return tag.servers;
  }
  return undefined;
}
