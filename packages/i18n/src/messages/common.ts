/**
 * Les mots que TOUT rend : verbes d'action, navigation principale, facturation.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/** Verbes et mots d'action réutilisés partout — la première chose à ne pas dupliquer. */
export interface CommonMessages {
  cancel: string;
  save: string;
  close: string;
  retry: string;
  delete: string;
  confirm: string;
  loading: string;
  /** Un compte-rendu générique d'erreur, quand rien de plus précis n'est connu. */
  genericError: string;
}

/** La navigation principale — le Rail de bureau ET la barre mobile (`BottomNav`) lisent
 *  ces mêmes libellés (règle 9 : une navigation, une source). */
export interface NavMessages {
  /** Étiquette du lecteur d'écran sur l'élément `<nav>`. */
  ariaLabel: string;
  chats: string;
  /** Volontairement court (barre mobile) — « Compét. », « Skills ». */
  competences: string;
  memory: string;
  vault: string;
  library: string;
  settings: string;
}

/** Facturation / crédits. Les MONTANTS ne sont PAS ici : `Intl.NumberFormat` les rend
 *  selon la locale (`billing.ts` `formatCents`). Ici seulement la prose. */
export interface BillingMessages {
  /** Échec d'ouverture de la page de paiement Stripe. */
  checkoutOpenFailed: string;
}
