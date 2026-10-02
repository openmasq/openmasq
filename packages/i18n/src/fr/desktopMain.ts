/**
 * The FR « desktopMain » slice.
 */
import type { Messages } from "../messages";

export const desktopMain = {
  contextMenu: {
    openLink: "Ouvrir le lien",
    copyLinkAddress: "Copier l'adresse du lien",
    copy: "Copier",
    cut: "Couper",
    paste: "Coller",
    selectAll: "Tout sélectionner",
  },
  writeConfirm: {
    eyebrow: "Confirmation d'action",
    titleAllow: "Autoriser cette action ?",
    titleDisableGate: "Désactiver la confirmation ?",
    titleLeaveStrict: "Ne plus confirmer chaque action ?",
    noParams: "(aucun détail)",
    paramsUnreadable: "(détails impossibles à afficher)",
    allowLead: "L'assistant veut exécuter cette action avec",
    allowTail: ". Elle peut créer, modifier ou supprimer des données sur votre compte connecté.",
    technicalDetails: "Détails techniques",
    scopeLead: "« Toujours pour cet outil » n'autorise que",
    scopeTail: ", jusqu'à la fermeture de l'application.",
    disableGateLead: "Les écritures (e-mail, création ou modification sur un compte connecté) s'exécuteront",
    disableGateStrong: "sans vous demander",
    disableGateTail: ", jusqu'au prochain redémarrage. Ne le faites que si vous surveillez l'assistant.",
    leaveStrictBody:
      "En mode standard, vous confirmez une fois par conversation après une recherche web, et toujours en cas de signal de fuite ou de pièce jointe. Ce choix est conservé au redémarrage.",
    deny: "Refuser",
    denyDisableGate: "Garder la confirmation",
    denyLeaveStrict: "Continuer à confirmer",
    allow: "Autoriser",
    allowDisableGate: "Désactiver",
    allowLeaveStrict: "Passer en standard",
    allowTool: "Toujours pour cet outil",
  },
  updates: {
    ok: "OK",
    failedTitle: "Mise à jour impossible",
    noSpaceTitle: "Espace disque insuffisant",
    readyTitle: (brand, version) => `${brand} ${version} est prête`,
    readyBody: "Redémarrez l'app pour l'installer.",
    noSpaceStatus: (need, free) =>
      `Espace disque insuffisant pour installer la mise à jour : environ ${need} nécessaires, ${free} disponibles. Libérez de l'espace, puis relancez la mise à jour.`,
    noSpaceDetail: (brand, version, size, need, free) =>
      `Installer ${brand} ${version} (${size}) demande environ ${need} d'espace libre. Il reste ${free}. Libérez de l'espace disque, puis relancez la mise à jour.`,
    gigabytes: (n) => `${n} Go`,
    errors: {
      noSpace: "Espace disque insuffisant pour installer la mise à jour. Libérez de l'espace, puis réessayez.",
      readOnlyVolume: (brand) =>
        `Pour se mettre à jour, ${brand} doit être dans le dossier Applications. Déplacez l'app depuis le disque d'installation ou Téléchargements vers Applications, puis rouvrez-la.`,
      appRunning: (brand) =>
        `Une partie de l'app tournait encore. Quittez complètement ${brand}, puis relancez la mise à jour.`,
      signature: "La mise à jour téléchargée n'a pas pu être vérifiée. Réessayez.",
      serverDown: "Le serveur de mise à jour est indisponible pour le moment. L'app réessaiera automatiquement.",
      download: "Impossible de télécharger la mise à jour. Vérifiez votre connexion, puis réessayez.",
      network: "Impossible de joindre le serveur de mise à jour. Vérifiez votre réseau, puis réessayez.",
      generic: "La mise à jour a échoué. Réessayez plus tard.",
    },
  },
  atRest: {
    title: "Chiffrement au repos indisponible",
    message: (brand) => `${brand} n'a pas pu accéder au trousseau de votre système.`,
    detail:
      "Vos clés API, vos jetons de connexion, votre session et les correspondances de masquage seront enregistrés sur cet ordinateur sans chiffrement. Les fichiers sont réservés à votre compte utilisateur, mais restent lisibles par toute personne qui accède au disque. Installez ou déverrouillez un trousseau (libsecret, GNOME Keyring ou KWallet sur Linux), puis relancez l'app pour activer le chiffrement.",
    ok: "Compris",
  },
  mic: {
    title: "Micro bloqué",
    message: (brand) => `${brand} n'a pas accès au micro`,
    detail:
      "Autorisez le micro dans Réglages Système › Confidentialité et sécurité › Micro, puis relancez la dictée.",
    openSettings: "Ouvrir les Réglages",
    cancel: "Annuler",
  },
  dbFatal: {
    title: (brand) => `${brand} ne peut pas démarrer`,
    windows: (brand, url) =>
      `Un composant système dont la base de données locale a besoin manque sur cet ordinateur : le « Microsoft Visual C++ Redistributable » (x64).\n\nInstallez-le depuis ${url}, puis relancez ${brand}.\n\nSi le problème persiste, réinstallez ${brand} : cette version inclut normalement ce composant.`,
    other: (brand) =>
      `Le composant natif de la base de données locale n'a pas pu être chargé. Réinstallez ${brand} pour réparer l'installation.`,
  },
  customStack: {
    api: (host) => `API : ${host}`,
    gateway: (host) => `Passerelle : ${host}`,
    accounts: (host) => `Comptes : ${host}`,
    switchMessage: "Pointer l'application vers cette pile auto-hébergée ?",
    switchDetail:
      "L'application redémarre dans un profil séparé. Les conversations, le coffre et les clés de l'environnement actuel n'y sont pas copiés. Vous pouvez revenir en arrière à tout moment.",
    switchButton: "Basculer",
    forgetMessage: "Oublier la pile auto-hébergée ?",
    forgetDetail: "L'application redémarre sur l'environnement par défaut. Le profil de la pile reste sur le disque.",
    forgetButton: "Oublier",
    cancel: "Annuler",
  },
  notifyReplyReady: "Réponse prête.",
  filePicker: {
    title: "Joindre des fichiers",
    documents: "Documents",
    allFiles: "Tous les fichiers",
  },
  python: {
    downloading: (pct) => `Téléchargement de l'environnement Python…${pct != null ? ` ${pct} %` : ""}`,
    extracting: "Décompression de l'environnement Python…",
    installing: "Installation des bibliothèques Python…",
    ready: "Environnement Python prêt.",
    running: "Exécution du code…",
  },
  subscription: {
    notEnabled: (label) => `${label} n'est pas activé (Réglages → Modèles).`,
    missingClaude:
      "La CLI Claude Code est introuvable sur cet ordinateur. Installez-la et connectez-la à votre abonnement Claude, ou choisissez un autre modèle.",
    missingCodex:
      "La CLI Codex est introuvable sur cet ordinateur. Installez-la (`npm i -g @openai/codex`), connectez-la à votre compte ChatGPT (`codex login`), ou choisissez un autre modèle.",
    missingAntigravity:
      "La CLI Antigravity (`agy`) est introuvable sur cet ordinateur. Installez Antigravity, connectez-la à votre compte Google, ou choisissez un autre modèle.",
  },
  oauth: {
    pageTitle: (brand) => `${brand} : connexion réussie`,
    eyebrow: "Connecteur relié",
    heading: "Connexion réussie",
    body: (brand) =>
      `Votre connecteur est maintenant relié à ${brand}. Vous pouvez fermer cet onglet et revenir à l'application.`,
    hint: (brand) => `Vos identifiants restent sur votre ordinateur. ${brand} ne les envoie jamais au modèle.`,
    cancelled: "Connexion annulée",
    githubCodeCopied: (brand) => `Code ${brand} (copié) :`,
    githubPasteHint: "Collez-le (⌘V / Ctrl+V), puis autorisez l'accès.",
    githubWindowTitle: (name, code) => `Connecter ${name} : code ${code}`,
    githubDenied: "Accès refusé sur GitHub",
    githubExpired: "La connexion GitHub a expiré. Réessayez.",
    slackExpired: "La connexion Slack a expiré. Réessayez.",
    openRouterOk: (brand) => `Autorisation reçue. Vous pouvez fermer cet onglet et revenir dans ${brand}.`,
    openRouterMiss: (brand) => `Autorisation annulée ou incomplète. Revenez dans ${brand} pour réessayer.`,
    microsoftRefused: (detail) => `Connexion Microsoft refusée${detail ? ` : ${detail}` : ""}.`,
    microsoftAdminConsent: (brand) =>
      `Votre organisation demande l'approbation d'un administrateur pour connecter ${brand}. Transmettez-lui le lien ci-dessous : une seule approbation vaut pour tous les comptes de l'organisation, et la connexion se fera ensuite en un clic.`,
    tokenExchangeFailed: (provider, status) => `La connexion ${provider} n'a pas abouti (${status}).`,
  },
  mcp: {
    folderNotAllowed: (label) => `${label} : dossier non autorisé. Choisissez-le avec le bouton.`,
    folderRequired: (label) => `${label} : au moins un dossier est requis.`,
    blockedByOrg: "Votre organisation bloque ce service.",
    hostNotFound: "Hôte introuvable. Vérifiez l'adresse et votre connexion.",
    privateAddress: "Adresse refusée : ce serveur est sur un réseau interne ou privé.",
    urlRefused: (reason) => `URL refusée (hôte interne ou privé) : ${reason}`,
    apiKeyRefused: "Clé API refusée",
    noDynamicRegistration:
      "Ce serveur refuse l'inscription OAuth automatique : la connexion en un clic est impossible. Utilisez son équivalent par jeton dans « Serveurs locaux ».",
    accountAlreadyConnected: "Ce compte est déjà connecté.",
    missingClientId: "Client ID manquant (mode « Mes clés »).",
    builtinKeysMissing:
      "Les clés intégrées ne sont pas configurées pour ce connecteur. Utilisez « Mes clés » ou réessayez plus tard.",
    missingGoogleSecret: "Client secret Google manquant.",
    byoRequired: "Ce connecteur demande vos propres clés (« Mes clés »).",
    unknownConnector: (id) => `Connecteur inconnu : ${id}`,
  },
  folders: {
    cloudNotConnected: "Ce stockage n'est pas connecté.",
    onedriveNotProvisioned:
      "Ce compte Microsoft n'a pas encore d'espace OneDrive. Ouvrez OneDrive une fois avec ce compte (onedrive.com), ou vérifiez qu'il dispose d'une licence OneDrive, puis réessayez.",
    folderNotListed: "Ce dossier n'a pas pu être listé.",
    filesystemNotConnected: "Le connecteur Filesystem n'est pas connecté.",
  },
  byoKeysBlocked:
    "Votre organisation a désactivé les clés API personnelles. Les modèles qu'elle a ouverts fonctionnent sans clé. Votre administrateur gère la liste.",
} satisfies Messages["desktopMain"];
