/**
 * The FR catalogue's « viewers » slice — the SOURCE language: the document viewers.
 */
import type { Messages } from "../messages";

export const viewers = {
  eyebrow: "FICHIER · APERÇU",
  close: "Fermer",
  closeTip: "Fermer (Échap)",
  loadingFile: "Chargement du fichier",
  pendingNote: "L'aperçu masqué s'affiche ici une fois la lecture et le masquage terminés.",
  partialNote:
    "Aperçu provisoire : chaque passage s'affiche une fois masqué. Une valeur repérée plus loin peut encore être masquée dans ce qui est déjà affiché.",
  partialRest: (pct) => `Masquage en cours… ${pct} %`,
  reading: {
    pagesLabel: "Pages du document",
    pageMasked: (n) => `Page ${n} : masquée`,
    pageRead: (n) => `Page ${n} : lue, masquage en cours`,
    pageCurrent: (n) => `Page ${n} : lecture en cours`,
    pageWaiting: (n) => `Page ${n} : en attente`,
    tileRead: (n) => `Page ${n} · lue, masquage en cours`,
    tileCurrent: (n) => `Page ${n} · lecture en cours`,
    tileWaiting: (n) => `Page ${n} · en attente de lecture`,
    tileHeld: (n) => `Page ${n} · masquée, affichée une fois tout le document traité`,
    original: (n) => `Page ${n} · originale, pas encore masquée`,
  },
  extracted: (chars, status) => `${chars} caractères extraits · ${status}`,
  staleTip: "Masqué avec vos anciens réglages",
  staleChip: "Anciens réglages",
  rerunning: "Remasquage…",
  rerun: "Remasquer",
  unreadableFile: "Impossible de lire le fichier.",
  fileNotFound: "Fichier introuvable.",
  unreadableDocument: "Document illisible.",
  unreadablePresentation: "Présentation illisible.",
  unreadableSheet: "Feuille illisible.",
  noPreviewForFormat: "Aperçu indisponible pour ce format.",
  openFile: "Ouvrir le fichier",
  openExternal: "Ouvrir dans l'app externe",
  noTextExtracted:
    "Aucun texte n'a pu être extrait de ce fichier (image sans texte, PDF scanné non reconnu…).",
  sharedVersion: "Ce que reçoit le modèle",
  documentTab: "Document",
  redactedToggle: "Masqué",
  storedLocally: "stocké localement",
  askIdle: "Demander",
  askPending: "Préparation…",
  askFailed: "Échec, réessayer",
  maskedNote: (labels) => `Données masquées : ${labels}`,
  maskedNoteNoLabels: "Ce que reçoit le modèle",
  originalNote: "Original : vos données réelles, jamais envoyées telles quelles",
  keptClearTip: "Envoyée non masquée au modèle. Cliquez pour la remasquer.",
  reRedactAll: "Tout remasquer",
  selectToRedact: "Sélectionnez une valeur pour la masquer manuellement",
  missedValueLead:
    "Si une valeur n'est pas masquée, cliquez dessus dans le document, ou passez à la vue ",
  missedValueTail: " et sélectionnez-la pour la masquer à la main.",
  markAria: (kind, kept) =>
    `Valeur masquée${kind ? ` (${kind})` : ""}${kept ? ", laissée non masquée" : ""}. Inspecter`,
  cellAria: (kept) => `Cellule masquée${kept ? ", laissée non masquée" : ""}. Inspecter`,
  search: {
    placeholder: "Rechercher dans le texte…",
    previous: "Résultat précédent",
    next: "Résultat suivant",
    clear: "Effacer la recherche",
  },
  pdf: {
    unavailable: "Aperçu PDF indisponible. Utilisez « Ouvrir ».",
    noPages: "Aucune page à afficher.",
    zoomGroup: "Zoom du document",
    zoomOut: "Dézoomer",
    zoomIn: "Zoomer",
    fitWidth: "Ajuster à la largeur du panneau",
    provisional:
      "Aperçu provisoire : une page encore originale le signale, et passe en version masquée dès qu'elle l'est. Une valeur repérée plus loin peut encore être masquée sur une page déjà masquée.",
    goToPage: (n) => `Aller à la page ${n}`,
    haloOn: "Surligné : texte lu sur la page, masqué avant envoi",
    haloOff: "Surlignage caché. Le texte lu sur la page reste masqué avant envoi.",
    showHalo: "Afficher le surlignage",
    hideHalo: "Cacher le surlignage",
    imageZones: (pages) =>
      `Les zones encadrées (logo, tampon, cachet) font partie de l'image. Elles ne sont pas dans le texte envoyé au modèle, donc pas surlignées.${pages}`,
    imagePages: (n) => ` ${n} page${n > 1 ? "s sont lues" : " est lue"} entièrement dans l'image.`,
    imageOnlyNote: (n) =>
      n > 1
        ? `${n} pages sont lues dans l'image : leur texte vient de la lecture des pixels, pas d'une couche texte.`
        : "Cette page est lue dans l'image : son texte vient de la lecture des pixels, pas d'une couche texte.",
  },
  summary: {
    redacting: "masquage en cours…",
    redactingProgress: (done, total) => `masquage en cours… (${done}/${total})`,
    failed: "échec du masquage",
    notChecked: "masquage non vérifié ici",
    none: "aucune valeur détectée",
    protected: (n) => `${n} valeur${n > 1 ? "s" : ""} protégée${n > 1 ? "s" : ""}`,
    byKind: (n, kind) => `${n} × ${kind}`,
  },
} satisfies Messages["viewers"];
