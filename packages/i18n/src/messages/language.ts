/**
 * La langue elle-même — le sélecteur des Réglages et ses options.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/** La langue elle-même — le sélecteur des Réglages (onglet « Compte », section
 *  Apparence) et ses options. C'est la SEULE surface qui doit rester lisible pour
 *  quelqu'un qui ne comprend PAS la langue affichée : d'où les endonymes ci-dessous, et
 *  une aide qui dit jusqu'où le choix porte. */
export interface LanguageMessages {
  /** Titre du réglage de langue. */
  label: string;
  /** Sous-titre : ce que le choix change — et ce qu'il ne change pas. */
  hint: string;
  /** Nom de CHAQUE langue, rendu dans SA propre langue (« Français », « English ») —
   *  un endonyme, jamais traduit, donc identique dans tous les catalogues. */
  names: { fr: string; en: string };
}
