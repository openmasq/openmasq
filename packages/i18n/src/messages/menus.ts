/**
 * The context MENUS and the lists they present.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/** A download format: its name, and what one gets. */
export interface DownloadFormatCopy {
  label: string;
  hint: string;
}

/**
 * The context MENUS — text selection, link, composer skills, a document's
 * views, download formats, a mark to keep in clear, the Mémoire's ⋯.
 *
 * They share one property that decides how they are written: they are opened IN PASSING,
 * on top of what one is reading. Hence one- or two-word labels, and
 * the explanation deferred to the `title`/`hint` — never the other way round.
 */
export interface MenusMessages {
  /** The menu that follows a text selection: redact, quote, remember. */
  selection: {
    ariaLabel: string;
    redact: string;
    redactTip: string;
    clarify: string;
    clarifyTip: string;
    remember: string;
    rememberTip: (brand: string) => string;
    rememberAria: string;
    /** The type submenu, and the scope the redaction must cover. */
    scopeAria: string;
    scopeConversation: string;
    scopeVault: string;
    typeEyebrow: string;
  };
  /** Opening a link: inside (the driven browser) or outside (the system one). */
  link: {
    ariaLabel: string;
    integratedBrowser: string;
    externalBrowser: string;
  };
  /** The composer's « / ». */
  skills: {
    actions: string;
    competences: string;
    empty: string;
    create: string;
  };
  /** The layers of an open document, and the button that switches them. */
  docView: {
    changeAria: string;
    listAria: string;
    currentTip: (view: string) => string;
  };
  download: {
    ariaLabel: string;
  };
  /** A mark one decides NOT to redact for this send. */
  markKeep: {
    keep: string;
    keepTip: string;
    uncertain: (brand: string) => string;
  };
  /** A page's ⋯ — today only the Mémoire's. */
  page: {
    moreActions: string;
    exportMemory: string;
    exportMemoryTip: string;
  };
}

/** The formats of the « Télécharger » menu of a document produced by a reply. */
export interface DownloadsMessages {
  pdf: DownloadFormatCopy;
  docx: DownloadFormatCopy;
  md: DownloadFormatCopy;
  txt: DownloadFormatCopy;
}

/** The LAYERS of an open document: what one is looking at, and what that layer shows. */
export interface DocViewsMessages {
  image: string;
  pdfRedacted: string;
  pdfRedactedHint: string;
  sheet: string;
  presentation: string;
  document: string;
  rendered: string;
  original: string;
  originalHint: string;
  redacted: string;
  redactedHint: string;
  ocr: string;
  ocrHint: string;
}
