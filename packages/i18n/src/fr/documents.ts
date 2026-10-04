/**
 * The FR « documents » slice.
 */
import type { Messages } from "../messages";

export const documents = {
  refused: {
    fileTooLarge: (mb) => `Fichier trop volumineux (${mb} Mo maximum). Découpez-le en plusieurs parties.`,
    pdfTooManyPages: (pages, max) => `PDF trop long (${pages} pages, ${max} maximum). Découpez-le en plusieurs parties.`,
    tooLongToMask: (pages) => `Document trop long pour être masqué en entier (≈ ${pages} pages). Découpez-le en plusieurs parties.`,
    executable: "Type de fichier non autorisé : le fichier contient du code exécutable.",
    typeMismatch: "Fichier refusé : son contenu ne correspond pas à son extension.",
    imageTooLarge: (width, height) => `Image refusée : dimensions trop grandes (${width}×${height}).`,
    imageUnreadable: "Image refusée : ses dimensions sont illisibles.",
    zipEntries: (entries) => `Fichier compressé refusé : il contient trop d'éléments (${entries}).`,
    zipTooLarge: "Fichier compressé refusé : il serait trop volumineux une fois décompressé.",
    zipRatio: "Fichier refusé : son taux de compression est anormal.",
  },
  ocr: {
    failed: "La reconnaissance de texte a échoué. La cause technique est dans le journal de débogage.",
    engineMissing: "Le moteur de reconnaissance de texte est indisponible. Réinstallez l'application.",
    engineIncompatible: "Le moteur de reconnaissance de texte est incompatible. Réinstallez l'application.",
    pdfRendererMissing: "Le moteur de rendu PDF est indisponible sur cet ordinateur. Réinstallez l'application.",
    pdfRendererIncompatible: "Le moteur de rendu PDF est incompatible avec cet ordinateur. Réinstallez l'application.",
  },
  scanPdf: (cause) => `Ce PDF n'a pas de couche texte. ${cause}`,
  pdfPagesUnread: (pages, cause) =>
    pages === 1
      ? `Ce PDF n'est pas joint : sa page en image n'a pas pu être lue. ${cause}`
      : `Ce PDF n'est pas joint : ses ${pages} pages en image n'ont pas pu être lues. ${cause}`,
  imageOcrFailed:
    "Le texte de l'image est illisible. La reconnaissance de texte a échoué. La cause technique est dans le journal de débogage.",
  unsupportedType: (ext) =>
    ext ? `Type de fichier non pris en charge : ${ext}` : "Type de fichier non pris en charge (aucune extension).",
  markers: {
    pageTooLarge: (page) => `[… page ${page} non océrisée : dimensions excessives]`,
  },
} satisfies Messages["documents"];
