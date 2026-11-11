/**
 * The FR « documents » slice.
 */
import type { Messages } from "../messages";

export const documents = {
  refused: {
    fileTooLarge: (mb) =>
      `Fichier trop volumineux (${mb} Mo maximum). Enregistrez-le en plusieurs fichiers plus petits, puis joignez-les un par un.`,
    pdfTooManyPages: (pages, max) =>
      `PDF trop long (${pages} pages, ${max} maximum). Enregistrez-le en plusieurs PDF plus petits, puis joignez-les un par un.`,
    tooLongToMask: (pages) =>
      `Document trop long pour être masqué en entier (≈ ${pages} pages). Enregistrez-le en plusieurs fichiers plus petits, puis joignez-les un par un.`,
    executable: "Type de fichier non autorisé : le fichier contient du code exécutable.",
    typeMismatch: "Fichier refusé : son contenu ne correspond pas à son extension.",
    imageTooLarge: (width, height) => `Image refusée : dimensions trop grandes (${width}×${height}).`,
    imageUnreadable: "Image refusée : ses dimensions sont illisibles.",
    zipEntries: (entries) => `Fichier compressé refusé : il contient trop d'éléments (${entries}).`,
    zipTooLarge: "Fichier compressé refusé : il serait trop volumineux une fois décompressé.",
    zipRatio: "Fichier refusé : son taux de compression est anormal.",
  },
  ocr: {
    failed:
      "Le texte n'a pas pu être lu. Réessayez. Si c'est un scan ou une photo, essayez une version plus nette. Si cela continue, signalez-le depuis « Votre avis ».",
    engineMissing: "Le moteur de reconnaissance de texte est indisponible. Réinstallez l'application.",
    engineIncompatible: "Le moteur de reconnaissance de texte est incompatible. Réinstallez l'application.",
    pdfRendererMissing: "Le moteur de rendu PDF est indisponible sur cet ordinateur. Réinstallez l'application.",
    pdfRendererIncompatible: "Le moteur de rendu PDF est incompatible avec cet ordinateur. Réinstallez l'application.",
  },
  scanPdf: (cause) => `Ce PDF est une image scannée : son texte doit être reconnu avant l'envoi. ${cause}`,
  pdfPagesUnread: (pages, cause) =>
    pages === 1
      ? `Ce PDF n'est pas joint : sa page en image n'a pas pu être lue. ${cause}`
      : `Ce PDF n'est pas joint : ses ${pages} pages en image n'ont pas pu être lues. ${cause}`,
  imageOcrFailed:
    "Le texte de l'image n'a pas pu être lu. Réessayez avec une image plus nette. Si cela continue, signalez-le depuis « Votre avis ».",
  readerUnavailable:
    "Le lecteur de documents n'a pas pu démarrer : le fichier n'est pas lu. Redémarrez l'application ; si cela continue, réinstallez-la.",
  readerOverMemory:
    "Ce fichier demande plus de mémoire que le lecteur de documents ne peut en utiliser : il n'est pas lu. Essayez avec un fichier plus léger, ou découpez-le.",
  readerOverDisk:
    "La lecture de ce fichier demande plus de place sur le disque que le lecteur de documents ne peut en utiliser : il n'est pas lu. Essayez avec un fichier plus léger, ou découpez-le.",
  unsupportedType: (ext) =>
    ext ? `Type de fichier non pris en charge : ${ext}` : "Type de fichier non pris en charge (aucune extension).",
  markers: {
    pageTooLarge: (page) => `[… page ${page} non lue : image trop grande]`,
  },
} satisfies Messages["documents"];
