/**
 * MAIN's copy of « ce compte a-t-il le droit d'utiliser SES PROPRES clés ? ».
 *
 * Sur un compte géré par une organisation, la réponse est non : l'organisation fournit les
 * modèles et paie les appels, donc une clé personnelle serait une sortie que sa politique
 * ne voit pas — le membre contournerait la liste des modèles autorisés simplement en
 * collant une clé OpenAI. L'interface le dit et masque la grille des clés, mais une
 * interface n'est qu'une interface : l'écriture et l'INJECTION se refusent ici.
 *
 * Ce module vit à côté du magasin de clés qu'il garde, et non dans la famille MCP, parce
 * qu'une vérification fail-closed doit se lire au même endroit que ce qu'elle protège
 * (règle 10) : le lecteur qui ouvre `keys.ts` voit la politique dans le même dossier.
 *
 * ⚠️ **Trois états, pas deux**, et les confondre rouvrirait tout :
 * - `null` = jamais publié (aucun profil poussé depuis le lancement) ⇒ **autorisé**, sinon
 *   un compte solo perdrait ses clés le temps que le renderer démarre ;
 * - `true` = politique connue, clés personnelles permises ;
 * - `false` = compte géré ⇒ **refus**.
 *
 * Comme la politique de connecteurs, la valeur ARRIVE du renderer et main ne peut pas la
 * vérifier : un renderer compromis au point de pousser `true` récupère ses clés. Ce qui est
 * fermé, c'est tout le reste — un appel IPC direct, une modale rouverte, une clé déjà
 * stockée avant l'adhésion à l'organisation. Le contrôle qui, lui, se PROUVE est
 * côté serveur : la passerelle refuse un modèle hors de l'allow-list de l'organisation.
 */

let byoAllowed: boolean | null = null;

/** Publier la posture. Tout ce qui n'est pas un booléen efface la politique (« pas
 *  encore su ») plutôt que d'être deviné — une politique à moitié lue a l'air appliquée. */
export function setOrgByoKeysAllowed(value: unknown): boolean | null {
  byoAllowed = typeof value === "boolean" ? value : null;
  return byoAllowed;
}

/** Les clés personnelles sont-elles refusées ? VRAI seulement sur un `false` explicite. */
export function isByoKeysBlocked(): boolean {
  return byoAllowed === false;
}

/** Le refus rendu au renderer — il nomme la cause, pas la plomberie : la personne doit
 *  savoir que ce n'est pas une panne et à qui s'adresser. */
export function byoKeysBlockedError(): Error {
  return new Error(
    "Les clés d'API personnelles sont désactivées par votre organisation. " +
      "Les modèles qu'elle a ouverts fonctionnent sans clé ; votre administrateur gère la liste.",
  );
}

/** Test seam. */
export function _resetKeysPolicy(): void {
  byoAllowed = null;
}
