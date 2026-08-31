/**
 * Tranche « viewers » du catalogue FR — la langue SOURCE : les visionneuses de documents.
 */
import type { Messages } from "../messages";

export const viewers = {
  eyebrow: "FICHIER · APERÇU",
  close: "Fermer",
  closeTip: "Fermer (Échap)",
  loadingFile: "Chargement du fichier",
  extracted: (chars, status) => `${chars} caractères extraits · ${status}`,
  staleTip: "Redacted avec vos anciens réglages",
  staleChip: "Anciens réglages",
  rerunning: "Reredaction…",
  rerun: "Reredact",
  unreadableFile: "Impossible de lire le fichier.",
  fileNotFound: "Fichier introuvable.",
  unreadableDocument: "Document illisible.",
  unreadablePresentation: "Présentation illisible.",
  unreadableSheet: "Feuille illisible.",
  noPreviewForFormat: "L'aperçu n'est pas disponible pour ce format dans l'app.",
  openFile: "Ouvrir le fichier",
  openExternal: "Ouvrir dans l'app externe",
  noTextExtracted:
    "Aucun texte n'a pu être extrait de ce fichier (image sans texte, PDF scanné non reconnu…).",
  sharedVersion: "La version partagée aux modèles",
  documentTab: "Document",
  redactedToggle: "Redacted",
  keptClearTip: "Gardée en clair — envoyée telle quelle au modèle. Cliquer pour re-redact.",
  reRedactAll: "Tout re-redact",
  selectToRedact: "Sélectionnez une valeur pour la redact manuellement",
  missedValueLead:
    "Une valeur n'a pas été masquée ? Cliquez dessus dans le document, ou passez à la vue ",
  missedValueTail: " et sélectionnez-la pour la redact à la main.",
  markAria: (kind, kept) =>
    `Valeur redacted${kind ? ` (${kind})` : ""}${kept ? " — gardée en clair" : ""} — inspecter`,
  cellAria: (kept) => `Cellule redacted${kept ? " — gardée en clair" : ""} — inspecter`,
  search: {
    placeholder: "Rechercher dans le texte…",
    previous: "Résultat précédent",
    next: "Résultat suivant",
    clear: "Effacer la recherche",
  },
  pdf: {
    unavailable: "Aperçu PDF indisponible (utilisez « Ouvrir »).",
    noPages: "Aucune page à afficher.",
    zoomGroup: "Zoom du document",
    zoomOut: "Dézoomer",
    zoomIn: "Zoomer",
    fitWidth: "Ajuster à la largeur du panneau",
    haloOn: "Halo = texte reconnu, redacted avant envoi",
    haloOff: "Halo masqué — le texte reconnu part redacted quand même",
    showHalo: "Réafficher le halo",
    hideHalo: "Masquer le halo",
    imageZones: (pages) =>
      `Les zones encadrées (logo, tampon, cachet) appartiennent à l'image : elles ne font pas partie du texte envoyé au modèle, et ne portent donc pas de halo.${pages}`,
    imagePages: (n) => ` ${n} page${n > 1 ? "s sont lues" : " est lue"} entièrement dans l'image.`,
  },
  summary: {
    redacting: "redaction en cours…",
    redactingProgress: (done, total) => `redaction en cours… (${done}/${total})`,
    failed: "échec du redaction",
    notChecked: "redaction non vérifié ici",
    none: "aucune valeur détectée",
    protected: (n) => `${n} valeur${n > 1 ? "s" : ""} protégée${n > 1 ? "s" : ""}`,
    byKind: (n, kind) => `${n} × ${kind}`,
  },
  sheetCut:
    "Classeur volumineux : une partie ne part pas au modèle (l'envoi tronque chaque document) — ce qui ne part pas ne quitte jamais la machine.",
} satisfies Messages["viewers"];
