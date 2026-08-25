import { BRAND } from "@openmasq/branding";
// La logique pure de la carte Environnement (Réglages → Versions) : à qui proposer la
// bascule, et quelle phrase mettre sur un refus. Séparée de la présentation (règle
// logique-en-.ts) et testée — c'est une porte d'AFFICHAGE seulement, la vraie garde
// revit dans le processus privilégié à chaque demande.

export type RuntimeEnv = "production" | "staging";

export const otherEnv = (env: RuntimeEnv): RuntimeEnv =>
  env === "production" ? "staging" : "production";

/**
 * Proposer la bascule ?
 *
 * - Depuis STAGING : toujours — le RETOUR en production est permis à tous côté main
 *   (revenir à l'environnement par défaut n'est pas un privilège), et cacher le bouton
 *   ferait d'une app basculée un cul-de-sac.
 * - Depuis production : au drapeau de compte `staging_tester` (lu fail-closed) ou au
 *   privilège machine (`crossEnv`, le même qui montre les deux flux de versions).
 */
export function envSwitchOffered(p: {
  env: RuntimeEnv;
  stagingTester: boolean;
  crossEnv: boolean;
}): boolean {
  return p.env === "staging" || p.stagingTester || p.crossEnv;
}

/** Le vocabulaire de refus du main → une phrase honnête pour l'utilisateur. */
export function switchRefusalText(reason?: string): string {
  switch (reason) {
    case "not_privileged":
      // ⚠️ « accès bêta » était FAUX ici : ce drapeau ouvre l'ENVIRONNEMENT de test (à
      // quelle API l'app parle), pas le canal bêta (quels builds elle reçoit). Les deux
      // sont indépendants depuis l'artefact unique — `main/ipc/registerEnvIpc.ts`.
      return `Bascule refusée : ce compte n'est pas autorisé sur l'environnement de test. L'accès s'accorde par l'équipe ${BRAND.name}.`;
    case "write_failed":
      return "La bascule n'a pas pu être enregistrée — rien n'a changé. Réessayez.";
    default:
      return "La bascule a échoué. Réessayez.";
  }
}
