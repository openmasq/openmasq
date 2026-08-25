import type { Conversation } from "../types";

/**
 * « Comprendre mon redaction » — le petit conteneur sous les PREMIÈRES réponses, qui
 * ouvre le chapitre redaction du guide (`help/guide.ts`, chapitre `protection`).
 *
 * Ce qu'il couvre que l'encart de transparence ne couvre PAS : les subtilités qui ne se
 * voient pas dans une conversation donnée — les personnalités publiques laissées en
 * clair, le compteur à zéro d'une conversation SANS donnée personnelle (le cas où
 * l'encart de transparence, précisément, ne se montre jamais), le Coffre pour les noms
 * de code. L'encart de transparence montre une preuve ; celui-ci apprend les règles.
 *
 * Deux décisions, et leurs raisons :
 *
 *  - **Il attend la première réponse ARRIVÉE.** Avant elle, rien n'est parti : proposer
 *    d'« expliquer mon redaction » ne désigne encore rien, et l'écran d'accueil a déjà
 *    son onboarding.
 *  - **« Fermer pour toujours » est global et définitif** (`Settings.redactionIntroSeen`,
 *    jamais un état de composant — sinon il revient au prochain montage, la leçon des
 *    encarts voisins). Définitif parce que ce savoir reste atteignable ailleurs : le
 *    MÊME chapitre vit dans Aide. Un rappel qui reviendrait « au cas où » est le bruit
 *    dont l'utilisateur apprend à se débarrasser.
 */
export function shouldShowRedactionIntro(
  conv: Conversation | null | undefined,
  seen: boolean | undefined,
): boolean {
  if (!conv || seen) return false;
  return (conv.messages ?? []).some((m) => m.role === "assistant" && !m.pending);
}
