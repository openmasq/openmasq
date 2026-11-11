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
    allowLead: "L'assistant veut exécuter l'action",
    allowTail: ". Elle peut créer, modifier ou supprimer des données sur votre compte connecté.",
    technicalDetails: "Détails techniques",
    scopeLead: "« Toujours pour cet outil » : l'action",
    scopeTail: " ne vous sera plus demandée, dans toutes vos conversations, jusqu'à la fermeture de l'application.",
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
    runByTools: {
      hidden:
        "Cet emplacement est caché. Git, votre éditeur ou un assistant de code y lisent ce qu'ils exécutent : ce que l'assistant y écrit peut s'exécuter sans que vous le relisiez.",
      orders:
        "Ce fichier est lu comme des instructions par d'autres outils (gestionnaire de paquets, automatisation, assistant de code) : ce que l'assistant y écrit peut s'exécuter sans que vous le relisiez.",
      installed:
        "Ce dossier contient du code installé, que vos projets exécutent sans que personne le relise.",
    },
    runByToolsPath: "Emplacement",
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
  windowHealth: {
    hungTitle: "La fenêtre ne répond plus",
    hungMessage: (brand) => `${brand} ne répond plus`,
    hungDetail:
      "Vous pouvez attendre encore un peu, ou recharger la fenêtre. Vos conversations enregistrées restent sur cet ordinateur ; un message en cours d'écriture peut être perdu.",
    goneTitle: "La fenêtre s'est arrêtée",
    goneMessage: (brand) => `La fenêtre de ${brand} s'est arrêtée`,
    goneDetail:
      "Rechargez la fenêtre pour continuer. Vos conversations enregistrées restent sur cet ordinateur ; un message en cours d'écriture peut être perdu.",
    goneMemoryDetail:
      "La fenêtre a manqué de mémoire. Rechargez-la pour continuer ; fermer d'autres applications ou une conversation très longue peut aider. Vos conversations enregistrées restent sur cet ordinateur.",
    reload: "Recharger",
    wait: "Attendre",
    quit: "Quitter",
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
    downloading: (pct) => `Préparation de l'outil de calcul (une seule fois, environ 1 min)…${pct != null ? ` ${pct} %` : ""}`,
    extracting: "Préparation de l'outil de calcul (une seule fois)…",
    installing: "Installation des modules de calcul (une seule fois)…",
    ready: "Outil de calcul prêt.",
    running: "Calcul en cours sur votre ordinateur…",
  },
  subscription: {
    notEnabled: (label) => `${label} n'est pas activé (Réglages → Modèles).`,
    missingClaude:
      "Claude Code n'est pas installé sur cet ordinateur. Réglages → Modèles vous guide pour l'installer et vous connecter avec votre abonnement Claude. Vous pouvez aussi choisir un autre modèle.",
    missingCodex:
      "L'application Codex n'est pas installée sur cet ordinateur. Réglages → Modèles vous guide pour l'installer et vous connecter avec votre compte ChatGPT. Vous pouvez aussi choisir un autre modèle. (Pour les experts : `npm i -g @openai/codex`, puis `codex login`.)",
    missingAntigravity:
      "Antigravity n'est pas installé sur cet ordinateur. Réglages → Modèles vous guide pour l'installer et vous connecter avec votre compte Google. Vous pouvez aussi choisir un autre modèle.",
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
    tokenExchangeFailed: (provider, status) => `La connexion ${provider} n'a pas abouti (code ${status}).`,
  },
  mcp: {
    folderNotAllowed: (label) => `${label} : dossier non autorisé. Choisissez-le avec le bouton.`,
    folderRequired: (label) => `${label} : au moins un dossier est requis.`,
    blockedByOrg: "Votre organisation bloque ce service.",
    hostNotFound: "Hôte introuvable. Vérifiez l'adresse et votre connexion.",
    privateAddress: "Adresse refusée : ce serveur est sur un réseau interne ou privé.",
    urlRefused: (reason) => `URL refusée (hôte interne ou privé) : ${reason}`,
    apiKeyRefused: "Clé API refusée",
    specAltered:
      "Ce connecteur n'a pas pu être vérifié : son adresse ou ses dossiers ont changé en dehors de l'application, ou le trousseau est verrouillé. Retirez-le, puis connectez-le de nouveau.",
    noDynamicRegistration:
      "Ce service ne permet pas la connexion en un clic. S'il vous fournit une clé d'accès, ajoutez-le avec « Connexion manuelle », en bas de la liste des connecteurs. Sinon, il n'est pas encore pris en charge.",
    accountAlreadyConnected: "Ce compte est déjà connecté.",
    missingClientId: "Il manque l'ID client (option « Mes clés »).",
    builtinKeysMissing:
      "La connexion en un clic n'est pas disponible pour ce connecteur dans cette version de l'application. Utilisez l'option « Mes clés », ou réessayez après une mise à jour.",
    oneClickNotConfigured:
      "La connexion en un clic à ce service n'est pas disponible dans cette version de l'application. Réessayez après une mise à jour ; si ça continue, signalez-le.",
    missingGoogleSecret: "Il manque le code secret du client Google.",
    byoRequired: "Ce connecteur demande vos propres clés (« Mes clés »).",
    unknownConnector: (id) => `Connecteur inconnu : ${id}`,
  },
  folders: {
    cloudNotConnected: "Ce stockage n'est pas connecté.",
    onedriveNotProvisioned:
      "Ce compte Microsoft n'a pas encore d'espace OneDrive. Ouvrez OneDrive une fois avec ce compte (onedrive.com), ou vérifiez qu'il dispose d'une licence OneDrive, puis réessayez.",
    folderNotListed: "Ce dossier n'a pas pu être listé.",
    filesystemNotConnected: "Le connecteur « Vos dossiers » n'est pas connecté.",
  },
  byoKeysBlocked:
    "Votre organisation a désactivé les clés API personnelles. Les modèles qu'elle a ouverts fonctionnent sans clé. Votre administrateur gère la liste.",
} satisfies Messages["desktopMain"];
