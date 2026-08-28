/**
 * LE CONTRAT de traduction — l'interface que CHAQUE langue implémente.
 *
 * C'est le cœur du choix « catalogue typé, aucune bibliothèque » (cf. `CLAUDE.md`) : une
 * clé manquante ou en trop dans `fr.ts`/`en.ts` est une erreur `tsc`, pas un repli
 * silencieux à l'exécution. Aucun parseur ICU, aucun chargeur runtime dans un produit
 * dont la posture est « rien de non vérifié ne s'exécute » — l'interpolation et les
 * pluriels sont des FONCTIONS TypeScript typées, et les nombres/dates/monnaies passent
 * par `Intl` (présent dans Electron et tout navigateur).
 *
 * ## Comment ajouter une clé
 *
 * 1. l'ajouter ICI (dans le bon namespace) ;
 * 2. `tsc` casse sur `fr.ts` ET `en.ts` tant que les deux ne l'ont pas — c'est voulu ;
 * 3. une entrée à variable est une fonction `(x) => string`, jamais un gabarit à trous.
 *
 * ## Comment ajouter une LANGUE
 *
 * Un nouveau fichier `xx.ts` qui `satisfies Messages`, ajouté à `MESSAGES` dans
 * `locale.ts` et à l'union `Locale`. Le compilateur exige alors chaque clé : la porte est
 * ouverte, et elle refuse une langue incomplète.
 *
 * Les namespaces suivent les SURFACES, pas les fichiers — un même mot rendu à deux
 * endroits a une seule entrée (règle 9 appliquée à la copie).
 */
export interface Messages {
  /** Verbes et mots d'action réutilisés partout — la première chose à ne pas dupliquer. */
  common: {
    cancel: string;
    save: string;
    close: string;
    retry: string;
    delete: string;
    confirm: string;
    loading: string;
    /** Un compte-rendu générique d'erreur, quand rien de plus précis n'est connu. */
    genericError: string;
  };

  /** La navigation principale — le Rail de bureau ET la barre mobile (`BottomNav`) lisent
   *  ces mêmes libellés (règle 9 : une navigation, une source). */
  nav: {
    /** Étiquette du lecteur d'écran sur l'élément `<nav>`. */
    ariaLabel: string;
    chats: string;
    /** Volontairement court (barre mobile) — « Compét. », « Skills ». */
    competences: string;
    memory: string;
    vault: string;
    library: string;
    settings: string;
  };

  /** Facturation / crédits. Les MONTANTS ne sont PAS ici : `Intl.NumberFormat` les rend
   *  selon la locale (`billing.ts` `formatCents`). Ici seulement la prose. */
  billing: {
    /** Échec d'ouverture de la page de paiement Stripe. */
    checkoutOpenFailed: string;
  };

  /** La langue elle-même — le sélecteur et ses options (le sélecteur d'UI est un suivant
   *  tracé ; le contrat, lui, existe dès maintenant pour que la langue soit nommable). */
  language: {
    /** Titre du réglage de langue. */
    label: string;
    /** Nom de CHAQUE langue, rendu dans SA propre langue (« Français », « English ») —
     *  un endonyme, jamais traduit, donc identique dans tous les catalogues. */
    names: { fr: string; en: string };
  };
}
