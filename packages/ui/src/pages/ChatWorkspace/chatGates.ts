import { useState } from "react";
import { featureUsage, useFeatureAccess } from "../../state/featureAccess";
import type { Competence } from "../../types";

/**
 * Les PORTES gouvernables telles que l'écran de conversation les voit, et la seule
 * pièce d'état qui en dépend — dans un module à part parce que `ChatView` et `Composer`
 * les lisent tous les deux, et qu'aucun des deux n'a à savoir laquelle des trois
 * fonctionnalités coupe aussi son usage (`@openmasq/catalog` `flags.ts` le dit).
 *
 * ⚠️ `memoryOpen` ne gouverne que des AFFORDANCES — « Retenir », l'amorce, la carte de
 * proposition, « /retenir ». La Mémoire continue de s'injecter, d'être interrogeable et
 * de s'extraire porte fermée : c'est la décision produit, épinglée dans les deux sens
 * par `state/featureAccess.test.ts`. `skillsUsable`, lui, coupe pour de bon.
 */
export interface ChatGates {
  /** Les Compétences peuvent-elles être mises en scène / proposées / adoptées ? */
  skillsUsable: boolean;
  /** Les affordances de la Mémoire s'affichent-elles ? (son fonctionnement, lui, ne
   *  dépend PAS de ça.) */
  memoryOpen: boolean;
  /** La compétence mise en scène pour le PROCHAIN envoi : l'ENTITÉ, jamais du texte —
   *  son prompt ne touche pas le brouillon, il rejoint la charge modèle à l'envoi.
   *  `null` dès que l'usage est fermé, sans effacer l'état : rouvrir la porte rend la
   *  mise en scène telle quelle, et un drapeau qui bascule ne détruit rien. */
  activeCompetence: Competence | null;
  setActiveCompetence: (c: Competence | null) => void;
}

/** Les deux portes seules — ce dont le `Composer` a besoin (l'état mis en scène
 *  appartient à `ChatView`, qui prend `useChatGates` juste en dessous). */
export function useChatDoors(): Pick<ChatGates, "skillsUsable" | "memoryOpen"> {
  const access = useFeatureAccess();
  return { skillsUsable: featureUsage("competences"), memoryOpen: access.memory };
}

export function useChatGates(): ChatGates {
  const doors = useChatDoors();
  const [staged, setActiveCompetence] = useState<Competence | null>(null);
  return {
    ...doors,
    activeCompetence: doors.skillsUsable ? staged : null,
    setActiveCompetence,
  };
}
