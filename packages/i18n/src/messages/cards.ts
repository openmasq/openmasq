/**
 * Les CARTES du fil de conversation — celles qui s'insèrent entre les messages, et les
 * deux modales qui les prolongent.
 *
 * ⚠️ Règle 8 : la moitié de ces phrases sont des PROMESSES sur ce qui quitte la machine
 * (« seule la version redacted part », « c'est exactement ce qui partira », « envoyé en
 * clair »). Les traduire, c'est traduire l'engagement du produit, pas une étiquette — une
 * carte qui sur-vend la protection est un bug de confiance, une qui la sous-vend fait
 * renoncer à une fonctionnalité sans raison.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */
export interface CardsMessages {
  /** L'écran d'accueil d'un fil vide. */
  welcome: {
    /** La CLAIM de confidentialité, tenue à UNE ligne : elle ne nomme que ce que les
     *  catégories PAR DÉFAUT attrapent réellement. Si le défaut change, la phrase change. */
    subtitle: string;
    seeExamples: string;
    seeOthers: string;
  };

  /** « Voir ce que le modèle a vu » — proposée une fois, après un tour protégé. */
  transparency: {
    ariaLabel: string;
    eyebrow: string;
    note: string;
    later: string;
    open: string;
    title: (count: number) => string;
    /** Le nom du modèle quand on l'a ; sinon « Le modèle ». */
    theModel: string;
    desc: (modelName: string) => string;
  };

  /** L'offre d'activer la mémoire automatique, quand un fil porte des faits durables. */
  memoryProposal: {
    eyebrow: string;
    note: string;
    decline: string;
    activate: string;
    title: (brand: string) => string;
    desc: (brand: string) => string;
  };

  /** Le rappel « comprendre mon redaction », fermable pour de bon. */
  redactionIntro: {
    ariaLabel: string;
    title: string;
    sub: string;
    closeTip: string;
    close: string;
  };

  /** Les bandeaux du fil. */
  banners: {
    attachmentIgnored: string;
  };

  /** La modale « comment envoyer ce document » : texte extrait ou pages en images. */
  sendMode: {
    title: string;
    question: (fileCount: number) => string;
    textOption: string;
    /** Le compte arrive DÉJÀ formaté par l'appelant (`tokenLabel`) — on ne le reformate
     *  pas ici, sous peine de compter deux fois la locale. */
    textTokens: (tokens: string) => string;
    textDesc: string;
    fileOption: string;
    computing: string;
    approx: (size: string) => string;
    fileDesc: string;
    tooBig: string;
    noFiles: (modelLabel: string) => string;
    switchAndSend: (modelLabel: string) => string;
    cancel: string;
  };

  /**
   * La carte qui BLOQUE une action d'écriture le temps d'un clic. Trois raisons, trois
   * formulations — et une note commune, qui est la phrase la plus lourde de l'écran :
   * ce qui est affiché est la VRAIE donnée, pas un pseudonyme.
   */
  writeConfirm: {
    ariaLabel: string;
    cancel: string;
    target: string;
    note: string;
    attachmentsWarning: (count: number) => string;
    navExfil: { eyebrow: string; title: (host: string) => string; titleNoHost: string; desc: string; confirm: string };
    attachments: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
    action: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
  };
}
