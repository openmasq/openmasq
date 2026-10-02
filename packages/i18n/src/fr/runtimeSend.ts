/**
 * The FR « runtime » slice, second half — the SOURCE language: send blockers, attachment,
 * import and drop messages, and the small run-time labels. Assembled by `./runtime.ts`.
 *
 * ⚠️ « Rien n'a été envoyé » is said where the send is blocked BEFORE any call, and nowhere else.
 */
import type { Messages } from "../messages";

const NOT_MASKED = "Les noms et prénoms n'ont pas été masqués. Rien n'a été envoyé.";

export const runtimeSend = {
  maskingBlocked: (cause) => `Envoi bloqué : ${cause}. Rien n'a été envoyé. Réessayez.`,
  maskingCause: {
    network: "le masquage ne répond pas",
    auth: "le masquage a échoué de notre côté",
    unknown: "le masquage n'a pas pu s'exécuter",
  },
  modelBlockedByOrg: (model) => `Votre organisation a désactivé le modèle « ${model} ». Choisissez-en un autre.`,
  creditsSold:
    "Crédits épuisés. Passez à un abonnement supérieur, utilisez votre propre clé, ou attendez le renouvellement.",
  creditsUnsold:
    "Ce modèle n'est pas disponible sur votre compte pour le moment. Utilisez votre propre clé, ou choisissez un autre modèle.",
  creditsOrg:
    "Crédits épuisés : le budget de votre organisation est atteint. Utilisez votre propre clé, ou attendez le renouvellement.",
  suspended: "Votre organisation a suspendu votre accès. L'envoi est bloqué.",
  paidUnavailable: "Ce modèle est indisponible pour le moment. Réessayez plus tard.",
  genericError: "Une erreur est survenue.",
  fileStillMasking: "Masquage du fichier en cours. Attendez la fin avant d'envoyer.",
  maskFail: {
    remoteAuth: `Masquage en ligne indisponible : erreur de notre côté. ${NOT_MASKED} Réessayez plus tard, ou contactez le support.`,
    remoteNetwork: `Masquage en ligne injoignable. ${NOT_MASKED} Vérifiez votre connexion, puis réessayez.`,
    remoteUnknown: `Masquage en ligne indisponible. ${NOT_MASKED} Réessayez plus tard.`,
    local: `Masquage hors ligne indisponible : le modèle de détection n'a pas pu se charger. ${NOT_MASKED} Réessayez, puis réinstallez l'app si le problème persiste.`,
    modelAuth: `Masquage indisponible : clé manquante ou invalide. ${NOT_MASKED} Renseignez la clé dans Réglages → Confidentialité.`,
    modelNetwork: `Masquage indisponible : modèle injoignable. Vérifiez qu'Ollama est démarré et que l'adresse est correcte. ${NOT_MASKED}`,
    modelUnknown: `Masquage indisponible. ${NOT_MASKED}`,
  },
  token: {
    outage: (brand) =>
      `Le serveur de connexion ${brand} ne répond pas. Rien n'a été envoyé. Vérifiez votre connexion, puis réessayez.`,
    freeModel: (brand) => `Reconnectez-vous pour continuer. Ce modèle gratuit ne demande que votre compte ${brand}.`,
    unknownTier: (brand) =>
      `Ce modèle passe par votre compte ${brand}. Votre session n'est plus connectée. Reconnectez-vous.`,
    paidTier: (brand) =>
      `Votre abonnement ${brand} couvre ce modèle. Votre session n'est plus connectée. Reconnectez-vous.`,
    freeTier: (brand) =>
      `Ce modèle est inclus dans l'abonnement ${brand}. Prenez un abonnement pour l'utiliser, ou renseignez votre propre clé.`,
  },
} satisfies Messages["runtime"]["send"];

export const runtimeFiles = {
  notMaskedHere: (categories) => `Catégories désactivées, non masquées ici : ${categories}`,
  notMaskedMore: (more) => ` et ${more} autres`,
  docMaskFailed:
    "Le masquage de ce document a échoué. Rien n'est masqué dans ces vues, et l'envoi reste bloqué tant qu'il n'a pas réussi.",
  retryMasking: "Relancer le masquage",
  cutHere: (rest, max) =>
    `Coupé ici. La suite (${rest} caractères) n'est pas envoyée : chaque document est coupé à ${max} caractères.`,
  maskSelection: (value) => `Masquer « ${value} »`,
  imageOnlyZone:
    "Zone d'image (logo, scan) absente du texte envoyé. La masquer ne sert que si le document est envoyé en images.",
  sheetHasMasked: (name) => `${name} : contient des données masquées`,
  sheetCutRows: (row) =>
    `Envoi tronqué : seules les lignes 1 à ${row} sont envoyées au modèle. Les lignes grisées ne sont pas envoyées, elles n'ont donc pas besoin d'être masquées.`,
  sheetCutAll: "Envoi tronqué : ce fichier dépasse la limite d'envoi, aucune ligne n'est envoyée au modèle.",
  sheetPreviewCut: (rows, cols) => `Aperçu tronqué (${rows} lignes × ${cols} colonnes max).`,
  skillsNothing: (brand) =>
    `Rien de reconnaissable ici. ${brand} cherche des dossiers contenant un « SKILL.md », ou des fichiers .md déposés directement.`,
  skillsDropUnreadable: "Impossible de lire ce dépôt.",
  skillsDropSub: [
    "Le dossier ", { code: ".claude/skills" }, ", une compétence seule, un fichier ", { code: ".md" },
    ", ou le ", { code: ".zip" }, " téléversé sur claude.ai.",
  ],
  skillsNeedsFiles: (n) =>
    `S'appuie sur ${n} fichier${n > 1 ? "s" : ""} de son dossier : seules les instructions seront importées.`,
  skillsAsWorkflowTip: "Rangé dans les routines. Cliquez pour en faire une compétence.",
  skillsAsSkillTip: "Rangé dans les compétences. Cliquez pour en faire une routine.",
  skillsWorkflow: "Workflow",
  skillsSkill: "Compétence",
  skillsNote:
    "Un nom déjà pris n'écrase rien : l'import ajoute « (2) ». Vous pouvez relancer l'import sans risque, ou déposer un autre dossier ici pour changer de source.",
  folderFallbackName: "dossier",
  folderOfferOne: (brand, name) => `Donner à ${brand} l'accès au dossier « ${name} » ?`,
  folderOfferMany: (brand, n) => `Donner à ${brand} l'accès à ces ${n} dossiers ?`,
  folderOfferNote: (brand) =>
    `Une fenêtre du système s'ouvrira sur ce dossier pour que vous confirmiez. ${brand} ne peut pas s'accorder un dossier tout seul.`,
  folderGranted: (path) => `Dossier autorisé : ${path}`,
  folderAlready: (path) => `Ce dossier est déjà autorisé : ${path}`,
  folderUnavailable: "Les dossiers locaux ne sont pas disponibles sur cette plateforme.",
  folderRefused: (message) => `Autorisation refusée : ${message}`,
  importWrongProvider: (p) => `Ce fichier ressemble à un export ${p}. Sélectionnez « ${p} », puis réessayez.`,
  importNothing: (p) =>
    `Aucune conversation trouvée. Vérifiez qu'il s'agit bien de l'export ${p} (le .zip reçu par e-mail, ou son fichier conversations.json).`,
  importNotJson: "Ce fichier ne contient pas d'export de conversations lisible (JSON attendu).",
  importZipUnreadable: "Impossible de lire l'archive. Réessayez avec le zip d'export d'origine.",
  importNoJsonInZip: "Aucun fichier « conversations.json » dans cette archive.",
} satisfies Messages["runtime"]["files"];

export const runtimeMisc = {
  egressSources: {
    browser: "Navigateur piloté",
    "browser-favicon": "Navigateur piloté",
    connector: "Connecteur",
    "mcp-connect": "Connexion d'un connecteur",
    "tool-result-fetch": "Téléchargement depuis un outil",
    "fetch-url": "Téléchargement depuis un outil",
    "link-preview": "Aperçu de lien",
    "web-fetch-many": "Lecture de pages web",
    "model-catalogue": "Catalogue de modèles",
    embeddings: "Index sémantique",
    "safe-fetch": "Téléchargement",
    unknown: "Non attribué",
  },
  dropRegions: {
    center: "Déplacer ici",
    left: "Diviser à gauche",
    right: "Diviser à droite",
    top: "Diviser en haut",
    bottom: "Diviser en bas",
  },
  login: {
    generic: "Impossible pour le moment. Vérifiez votre connexion et réessayez.",
    rateLimit: "Trop de tentatives. Patientez un instant, puis réessayez.",
    network: "Réseau indisponible. Vérifiez votre connexion et réessayez.",
    signupsClosed:
      "Aucun compte pour cette adresse, et les inscriptions sont fermées pour le moment. Vérifiez l'orthographe. Si elle est bonne, l'accès doit encore être ouvert de notre côté.",
  },
  megabytes: (n) => `${n} Mo`,
  gigabytes: (n) => `${n} Go`,
  billingNetwork: "Connexion au service de paiement impossible. Vérifiez votre réseau.",
  feedback: {
    signedOut: "Connectez-vous pour envoyer un avis.",
    unavailable: "L'envoi a échoué de notre côté. Réessayez dans un moment. Votre message est toujours là.",
    network: "Envoi impossible. Vérifiez votre connexion. Votre message est toujours là.",
  },
  mail: {
    truncated: "\n[… journal tronqué pour tenir dans un e-mail]",
    field: (label, value) => `${label} : ${value}`,
    mood: "Humeur",
    context: "— Contexte technique —",
    version: "Version",
    channel: "Canal",
    screen: "Écran",
    model: "Modèle",
    level: "Niveau",
    install: "Installation",
    journal: "— Journal (déjà masqué) —",
    subject: (category, product) => `[${category}] Avis ${product}`,
  },
} satisfies Messages["runtime"]["misc"];
