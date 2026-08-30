/**
 * Les MENUS contextuels et les listes qu'ils présentent.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/** Un format de téléchargement : son nom, et ce qu'on obtient. */
export interface DownloadFormatCopy {
  label: string;
  hint: string;
}

/**
 * Les MENUS contextuels — sélection de texte, lien, compétences du composeur, vues d'un
 * document, formats de téléchargement, marque à garder en clair, ⋯ de la Mémoire.
 *
 * Ils partagent une propriété qui décide de leur rédaction : on les ouvre EN PASSANT,
 * au-dessus de ce qu'on est en train de lire. D'où des étiquettes d'un ou deux mots, et
 * l'explication reportée dans le `title`/`hint` — jamais l'inverse.
 */
export interface MenusMessages {
  /** Le menu qui suit une sélection de texte : redact, préciser, retenir. */
  selection: {
    ariaLabel: string;
    redact: string;
    redactTip: string;
    clarify: string;
    clarifyTip: string;
    remember: string;
    rememberTip: (brand: string) => string;
    rememberAria: string;
    /** Le sous-menu des types, et la portée que le redaction doit couvrir. */
    scopeAria: string;
    scopeConversation: string;
    scopeVault: string;
    typeEyebrow: string;
  };
  /** Ouvrir un lien : dedans (navigateur piloté) ou dehors (celui du système). */
  link: {
    ariaLabel: string;
    integratedBrowser: string;
    externalBrowser: string;
  };
  /** Le « / » du composeur. */
  skills: {
    actions: string;
    competences: string;
    empty: string;
    create: string;
  };
  /** Les couches d'un document ouvert, et le bouton qui les change. */
  docView: {
    changeAria: string;
    listAria: string;
    currentTip: (view: string) => string;
  };
  download: {
    ariaLabel: string;
  };
  /** Une marque qu'on décide de NE PAS redact pour cet envoi. */
  markKeep: {
    keep: string;
    keepTip: string;
    uncertain: (brand: string) => string;
  };
  /** Le ⋯ d'une page — aujourd'hui la seule Mémoire. */
  page: {
    moreActions: string;
    exportMemory: string;
    exportMemoryTip: string;
  };
}

/** Les formats du menu « Télécharger » d'un document produit par une réponse. */
export interface DownloadsMessages {
  pdf: DownloadFormatCopy;
  docx: DownloadFormatCopy;
  md: DownloadFormatCopy;
  txt: DownloadFormatCopy;
}

/** Les COUCHES d'un document ouvert : ce qu'on regarde, et ce que cette couche montre. */
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
