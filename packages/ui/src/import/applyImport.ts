import { freeName } from "./claudeSkills";

/** Ce que l'écran d'import renvoie, rangé par l'utilisateur ligne à ligne. */
export interface ImportChoice {
  name: string;
  desc: string;
  prompt: string;
  /** Ce skill ressemble à une ROUTINE (il pilote des outils) — un pari de l'app que
   *  l'aperçu laisse corriger ligne à ligne. Il ne décide plus d'une LISTE d'arrivée
   *  (il n'y en a qu'une), seulement de la catégorie où la compétence est rangée. */
  asWorkflow: boolean;
}

export interface ImportTargets {
  /** Les noms DÉJÀ pris — un import n'écrase jamais ce que l'utilisateur a écrit. */
  competenceNames: readonly string[];
  addCompetence?: (input: {
    name: string;
    prompt: string;
    desc?: string;
    cat: string;
    servers?: string[];
  }) => void;
}

/**
 * Ranger un lot importé — la MÊME opération, quel que soit l'écran d'où l'import part.
 *
 * ⚠️ Ce fichier existait pour une raison qui a disparu avec la fusion : il y avait DEUX
 * listes d'arrivée, chaque écran ne connaissait que la sienne, et un nom entrant n'était
 * comparé qu'à la mauvaise — il pouvait donc naître une seconde routine portant
 * exactement le nom d'une existante, alors que le nom est ce par quoi on la retrouve. Il
 * n'y a plus qu'une liste, donc plus qu'un jeu de noms pris : la classe de bug est
 * fermée par construction, et il ne reste ici que la libération du nom.
 *
 * ⚠️ Aucun `servers` n'est deviné : un skill Claude ne nomme aucun connecteur de l'app, et
 * en inventer un rattacherait la routine à un service que la personne n'a peut-être pas
 * branché. Le pari « ça ressemble à une routine » ne va donc pas plus loin que la
 * CATÉGORIE, qui se corrige d'un menu.
 *
 * Rien n'écrase jamais : un nom pris prend « (2) », donc relancer un import est sans
 * risque pour ce que l'utilisateur a modifié depuis.
 */
export function applySkillImport(items: readonly ImportChoice[], t: ImportTargets): void {
  const taken = new Set(t.competenceNames);
  for (const it of items) {
    const name = freeName(it.name, taken);
    taken.add(name);
    t.addCompetence?.({
      name,
      prompt: it.prompt,
      desc: it.desc,
      cat: it.asWorkflow ? "routine" : "redaction",
    });
  }
}
