/**
 * Le contrat de la tranche « viewers » — les visionneuses de documents : l'aperçu d'une
 * pièce jointe avant l'envoi, le lecteur de la Bibliothèque, et leurs vues (PDF, tableur,
 * texte redacted).
 *
 * Le VOCABULAIRE des vues (« Redacted », « Original », « OCR ») vit dans `docViews` :
 * c'est le menu qui les choisit, et il existait avant ces écrans.
 */

export interface ViewersMessages {
  /** Le cadre commun : en-tête, fermeture, états de chargement et d'échec. */
  eyebrow: string;
  close: string;
  closeTip: string;
  loadingFile: string;
  extracted: (chars: string, status: string) => string;
  staleTip: string;
  staleChip: string;
  rerunning: string;
  rerun: string;
  /** Les échecs, un par format — dire lequel évite « ça ne marche pas ». */
  unreadableFile: string;
  fileNotFound: string;
  unreadableDocument: string;
  unreadablePresentation: string;
  unreadableSheet: string;
  noPreviewForFormat: string;
  openFile: string;
  openExternal: string;
  noTextExtracted: string;
  /** Le document partagé au modèle, et le va-et-vient réel ⇄ redacted. */
  sharedVersion: string;
  documentTab: string;
  redactedToggle: string;
  /** Ce qu'on garde en clair, à la main. */
  keptClearTip: string;
  reRedactAll: string;
  selectToRedact: string;
  missedValueLead: string;
  missedValueTail: string;
  /** Une marque, dans un document ou une cellule. */
  markAria: (kind: string, kept: boolean) => string;
  cellAria: (kept: boolean) => string;
  /** La recherche dans le texte. */
  search: {
    placeholder: string;
    previous: string;
    next: string;
    clear: string;
  };
  /** Le PDF : zoom, halo, et ce que l'image porte que le texte n'a pas. */
  pdf: {
    unavailable: string;
    noPages: string;
    zoomGroup: string;
    zoomOut: string;
    zoomIn: string;
    fitWidth: string;
    haloOn: string;
    haloOff: string;
    showHalo: string;
    hideHalo: string;
    imageZones: (pages: string) => string;
    imagePages: (count: number) => string;
  };
  /** Le sous-titre de l'aperçu : ce que le redaction a fait à CE document. */
  summary: {
    redacting: string;
    redactingProgress: (done: number, total: number) => string;
    failed: string;
    notChecked: string;
    none: string;
    protected: (count: number) => string;
    byKind: (count: number, kind: string) => string;
  };
  /** Le tableur : ce que l'envoi tronque. */
  sheetCut: string;
}
