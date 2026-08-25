/**
 * Les REFUS du transport — les raisons de ne rien envoyer qui ne dépendent ni du
 * consentement ni de la configuration, mais de l'ENVIRONNEMENT où la page tourne.
 *
 * Groupées ici plutôt que perdues au milieu de `sink.ts` : un relecteur doit voir la
 * famille d'un coup d'œil, et chacune est une fonction pure de globales du navigateur,
 * donc directement testable (`sink.test.ts`).
 *
 * ⚠️ Elles disent toutes NON de la même façon : positivement. Une condition qu'on ne peut
 * pas observer (pas de `navigator`, pas de `location`) n'est pas un refus — le contraire
 * ferait taire la production le jour où un contexte n'expose pas l'un des deux, et une
 * mesure absente ne se remarque pas.
 */

/** Do-Not-Track / Global Privacy Control : la personne a demandé qu'on ne la suive pas. */
export const dntEnabled = (): boolean => {
  try {
    const n = navigator as unknown as { doNotTrack?: string; globalPrivacyControl?: boolean };
    return n.doNotTrack === "1" || n.globalPrivacyControl === true;
  } catch {
    return false;
  }
};

/**
 * La page est-elle servie depuis la machine de quelqu'un qui développe ?
 *
 * Ce que ça empêche : un `pnpm dev` ouvert toute la journée, rechargé à chaque sauvegarde,
 * qui compte le développeur comme une cohorte dans les chiffres du produit. Même intention
 * que la suspension des lancements automatisés, mais décidée par l'HÔTE — donc rien à
 * câbler dans chaque app.
 *
 * ⚠️ Pas de `location` (rendu serveur, `file://` du bureau empaqueté) ⇒ **on émet**. Et le
 * test porte sur l'hôte ENTIER ou sur un suffixe : `localhost.exemple.fr` est un vrai
 * domaine, pas une boucle locale.
 */
export const isLoopbackHost = (): boolean => {
  try {
    const h = (location.hostname || "").toLowerCase();
    if (!h) return false;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h === "[::1]" ||
      h.endsWith(".localhost") ||
      // Le nom qu'un Mac se donne sur le réseau local (`macbook.local`) — c'est ainsi qu'on
      // ouvre un `pnpm dev` depuis un téléphone pour tester le rendu mobile.
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
};
