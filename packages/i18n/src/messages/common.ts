/**
 * Les mots que TOUT rend : verbes d'action, navigation principale, facturation.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/** Verbes et mots d'action réutilisés partout — la première chose à ne pas dupliquer. */
export interface CommonMessages {
  /**
   * La BALISE `Intl` de cette langue — « fr-FR », « en-GB ».
   *
   * Elle vit dans le catalogue pour que `t` suffise à tout formater : un formateur qui
   * réclamerait en plus la `Locale` obligerait chaque appelant à porter les deux, et
   * c'est exactement là qu'on finit par en oublier un. Régionale EXPRÈS — « fr » n'est
   * pas une balise de région, et `toLocaleString("fr")` ne groupe pas les milliers ni
   * n'écrit l'heure comme « fr-FR ».
   */
  intlTag: string;
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
/** Un palier d'abonnement tel que la grille le montre. Prix et crédits viennent du code. */
export interface PlanTierCopy {
  name: string;
  tag?: string;
  feats: readonly ((brand: string) => string)[];
}

export interface BillingMessages {
  /** Les deux CTA : pas d'abonnement encore, ou un plus grand. */
  ctaSee: string;
  ctaUpgrade: string;
  /** Ce qu'on lit quand l'usage inclus du mois est épuisé — deux surfaces le rendent. */
  exhaustedTitle: string;
  exhaustedBody: string;
  tiers: { free: PlanTierCopy; solo: PlanTierCopy; team: PlanTierCopy };
  tierLabels: { free: string; solo: string; team: string; scale: string };
  errors: {
    disabled: string;
    testerMode: string;
    alreadyActive: string;
    noCustomer: string;
    priceNotConfigured: string;
    stripe: string;
    signIn: string;
    accountNotFound: string;
    serverDown: string;
    generic: string;
  };
  /** Échec d'ouverture de la page de paiement Stripe. */
  checkoutOpenFailed: string;
  /** Le MODE GRATUIT du déploiement (`OPENMASQ_FREE_MODE`) : l'onglet Paiement n'a plus
   *  d'offre à montrer — tout est inclus. Titre, explication, et la ligne de la jauge qui
   *  ne peut plus dire « restants sur ». */
  freeModeEyebrow: string;
  freeModeTitle: string;
  freeModeBody: (brand: string) => string;
  /** « 1,20 € utilisés ce mois-ci · sans limite » — le montant vient d'`Intl`. */
  freeModeUsed: (amount: string) => string;
  /** Le libellé du palier synthétique servi en mode gratuit (`tierLabel`). */
  unlimitedTier: string;
}
