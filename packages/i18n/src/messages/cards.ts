/**
 * The conversation thread's CARDS — those that slot in between messages, and the
 * two modals that extend them.
 *
 * ⚠️ Rule 8: half of these sentences are PROMISES about what leaves the machine
 * (« seule la version redacted part », « c'est exactement ce qui partira », « envoyé en
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

  /** The « comprendre mon redaction » reminder, dismissible for good. */
  redactionIntro: {
    ariaLabel: string;
    title: string;
    sub: string;
    closeTip: string;
    close: string;
  };

  /** The thread's banners. */
  banners: {
    attachmentIgnored: string;
  };

  /** La modale « comment envoyer ce document » : texte extrait ou pages en images. */
  sendMode: {
    title: string;
    question: (fileCount: number) => string;
    textOption: string;
    /** The count arrives ALREADY formatted by the caller (`tokenLabel`) — we do not
     *  reformat it here, on pain of applying the locale twice. */
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
    navExfil: { eyebrow: string; title: (host: string) => string; titleNoHost: string; desc: string; confirm: string };
    attachments: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
    action: { eyebrow: string; title: string; desc: (server: string) => string; confirm: string };
  };
}
