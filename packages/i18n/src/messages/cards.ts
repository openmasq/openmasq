/**
 * The conversation thread's CARDS — those that slot in between messages, and the
 * two modals that extend them.
 *
 * ⚠️ Rule 8: half of these sentences are PROMISES about what leaves the machine
 * (« seule la version masquée part », « c'est exactement ce qui partira », « envoyé en
 * clair »). Translating them means translating the product's commitment, not a label — a
 * card that over-sells the protection is a trust bug, one that under-sells it makes
 * people give up a feature for no reason.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */
export interface CardsMessages {
  /** The home screen of an empty thread. */
  welcome: {
    /** The privacy CLAIM, held to ONE line: it names only what the DEFAULT
     *  categories actually catch. If the default changes, the sentence changes. */
    subtitle: string;
    seeExamples: string;
    seeOthers: string;
  };

  /** « Voir ce que le modèle a vu » — offered once, after a protected turn. */
  transparency: {
    ariaLabel: string;
    eyebrow: string;
    note: string;
    later: string;
    open: string;
    title: (count: number) => string;
    /** The model's name when we have it; otherwise « Le modèle ». */
    theModel: string;
    desc: (modelName: string) => string;
  };

  /** The offer to turn on automatic memory, when a thread carries durable facts. */
  memoryProposal: {
    eyebrow: string;
    note: string;
    decline: string;
    activate: string;
    title: (brand: string) => string;
    desc: (brand: string) => string;
  };

  /** The « comprendre mon masquage » reminder, dismissible for good. */
  redactionIntro: {
    ariaLabel: string;
    title: string;
    sub: string;
    closeTip: string;
    close: string;
  };

  /** « Connectez X pour continuer » — the connect cards under a reply the model could
   *  not honour for lack of a connector. Two shapes: one full card, or a tile grid. */
  integration: {
    manySuggested: (count: number) => string;
    secureNote: string;
    connectTools: string;
    tileConnected: (name: string) => string;
    tileConnect: (name: string) => string;
    activate: string;
    connect: (name: string) => string;
    suggested: string;
    connectedEyebrow: (name: string) => string;
    connectedResume: (brand: string) => string;
    resume: string;
    builtinNote: (brand: string) => string;
    activateTitle: (name: string) => string;
    connectTitle: (name: string) => string;
  };

  /** The thread's banners. */
  banners: {
    attachmentIgnored: string;
  };

  /**
   * The card that BLOCKS a write action for the length of one click. Three reasons, three
   * wordings — and one shared note, which is the heaviest sentence on the screen:
   * what is displayed is the REAL data, not a pseudonym.
   */
  writeConfirm: {
    ariaLabel: string;
    cancel: string;
    target: string;
    note: string;
    attachmentsWarning: (count: number) => string;
    details: (tool: string) => string;
    scopeNote: (tool: string) => string;
    navExfil: { eyebrow: string; title: (host: string) => string; titleNoHost: string; desc: string; confirm: string };
    attachments: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
    action: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
  };
}
