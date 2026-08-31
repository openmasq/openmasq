/**
 * LE PREMIER LANCEMENT — quatre écrans, plus le repli « régler finement ».
 *
 * ⚠️ C'est la seule surface qu'un anglophone rencontre AVANT d'avoir pu changer de langue :
 * le sélecteur vit dans les Réglages, derrière cet écran. Une phrase laissée en français
 * ici n'est pas une imperfection, c'est la première impression du produit pour quelqu'un
 * qui ne la lit pas.
 *
 * ⚠️ Règle 8 : les deux promesses de COMPORTEMENT du premier écran (les personnalités ne
 * sont jamais masquées ; on propose de révéler avant une recherche web) sont vraies du
 * moteur et épinglées par `demo.test.ts`. Elles existent pour éviter qu'on baisse la
 * protection au premier ratage — les traduire à la légère, c'est reprendre ce qu'elles
 * empêchent.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface OnboardingMessages {
  /** Les commandes de pied, présentes à chaque écran. */
  skip: string;
  back: string;
  next: string;
  start: string;

  /** Écran 0 — ce que le redaction FAIT, démontré plutôt qu'affirmé. */
  redaction: {
    eyebrow: string;
    titleLead: string;
    titleHighlight: string;
    sub: (brand: string) => string;
    /** Les deux promesses de comportement — cf. l'avertissement ci-dessus. */
    notoriety: { lead: string; strong: string; tail: string };
    webReveal: { lead: (brand: string) => string; strong: string; tail: string };
  };

  /** Écran 1 — les endroits où l'on travaille. Les noms viennent de `sections`. */
  places: {
    eyebrow: string;
    title: string;
    sub: string;
  };

  /** Écran 2 — l'accès aux modèles. Le titre CHANGE selon que ce build sert un abonnement. */
  access: {
    eyebrow: string;
    titleServed: string;
    titleUnserved: string;
    subServed: string;
    subUnserved: string;
  };

  /** Écran 3 — « c'est prêt ». La 2ᵉ phrase rend la 1ʳᵉ vérifiable : un modèle gratuit est
   *  sélectionné d'office, donc une installation neuve écrit sans clé ni abonnement. */
  ready: {
    eyebrow: string;
    title: string;
    subServed: (brand: string) => string;
    subUnserved: string;
    modelHint: string;
    slashHint: { lead: string; strong: string; tail: string };
    helpHint: { lead: string; strong: string; tail: string };
    tuneRedaction: string;
  };

  /** Le repli « régler finement », qui rend la même matrice que les Réglages. */
  tune: {
    eyebrow: string;
    title: string;
    sub: string;
  };

  /** Le choix d'ACCÈS : abonnement, ou sa propre clé. */
  keyChoice: {
    subscription: { title: (brand: string) => string; sub: string };
    ownKey: { title: string; sub: string };
    /** L'étiquette portée par l'option et par le fournisseur recommandés. */
    recommended: string;
    savedKey: (provider: string) => string;
    connect: string;
    connecting: string;
    retry: string;
    connectTip: (brand: string) => string;
    connectHint: string;
    manualCreate: string;
    manualHave: string;
    errorIncomplete: string;
    errorUnreachable: string;
    errorSaveFailed: string;
  };

  /** Le formulaire de clé : les étapes du fournisseur, puis le champ. */
  keySteps: {
    markDone: string;
    openHost: (host: string) => string;
    placeholder: (provider: string, hint: string) => string;
    placeholderPlain: (provider: string) => string;
    save: string;
    saving: string;
  };
}
