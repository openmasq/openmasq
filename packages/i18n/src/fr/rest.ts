/**
 * The FR catalogue's « rest » slice — the SOURCE language : connexion, partages
 * organization shares, model picker, shared leaves.
 */
import type { Messages } from "../messages";

export const login = {
  heading: "Content de vous revoir.",
  subheading:
    "Entrez votre e-mail : nous vous envoyons un lien de connexion, sans mot de passe.",
  checkYourEmail: "Consultez vos e-mails",
  passwordlessStrip: "SANS MOT DE PASSE · LIEN ENVOYÉ PAR E-MAIL",
  offline:
    "Vous êtes hors ligne. La connexion nécessite un accès réseau — vérifiez votre connexion, puis réessayez.",
  email: "E-mail professionnel",
  emailPlaceholder: "vous@entreprise.com",
  sending: "Envoi…",
  sendLink: "Envoyer le lien de connexion",
  or: "ou",
  continueWithGoogle: "Continuer avec Google",
  noPassword: "Pas de mot de passe : votre e-mail suffit.",
  code: "Code de connexion",
  verifying: "Vérification…",
  signInWithCode: "Se connecter avec le code",
  linkNotOpening: "Le lien ne s'ouvre pas ? Saisir le code reçu par e-mail",
  useAnotherAddress: "Utiliser une autre adresse",
  resend: "Renvoyer",
  resendLink: "Renvoyer le lien",
} satisfies Messages["login"];

export const orgShares = {
  requests: "Demandes de partage",
  requestsCount: (n) => `${n} demande${n > 1 ? "s" : ""} de partage`,
  requestsShort: "Demandes",
  empty: "Rien à examiner. Les termes et compétences proposés par vos collègues apparaîtront ici.",
  vaultTerm: "Terme du coffre",
  skill: "Compétence",
  proposedBy: (author) => `Proposé par ${author}`,
  someMember: "un membre",
  accept: "Accepter",
  refuse: "Refuser",
  myShares: "Mes partages",
  revoke: "Retirer",
  status: { pending: "En attente", approved: "Partagé", refused: "Refusé", revoked: "Retiré" },
  promote: {
    eyebrow: "Partager",
    title: "Avec qui ?",
    sub: "Vous gardez votre copie et pouvez continuer à la modifier.",
    search: "Rechercher un collègue",
    member: "Membre",
    nobody: "Personne de ce nom dans l'organisation.",
    picked: "Sélectionné :",
    previewTerm: "Le terme partagé",
    previewOther: "Ce qui sera partagé",
    termNote:
      "Le terme et son substitut deviennent communs avec les destinataires : ce nom sera masqué de la même façon dans vos conversations.",
    redactedNote: (n) => `${n} élément${n > 1 ? "s" : ""} masqué${n > 1 ? "s" : ""}`,
    redactedTail: " avant le partage — le texte ci-dessus est exactement ce que verront les autres.",
    clean: "Aucune donnée sensible détectée dans ce contenu.",
    send: "Envoyer la demande",
  },
  scopes: {
    org: {
      label: "Organisation",
      short: "Orga",
      note: "Partagé à toute l'organisation — visible et utilisable par tous les membres.",
    },
    team: {
      label: "Équipe",
      short: "Équipe",
      note: "Partagé avec votre équipe — visible et utilisable par ses membres.",
    },
    personal: { label: "Personnel", short: "Perso", note: "Visible de vous seul." },
  },
  targets: {
    person: {
      label: "Une personne",
      desc: "Un collègue de votre organisation.",
      approval: "Elle reçoit une demande et accepte — rien d'autre à valider.",
    },
    team: {
      label: "Votre équipe",
      desc: "Les membres de votre équipe.",
      approval: "Un administrateur est notifié et valide la demande.",
    },
    org: {
      label: "Toute l'organisation",
      desc: "Tous les comptes de l'organisation.",
      approval: "Un administrateur est notifié et approuve la demande.",
    },
  },
} satisfies Messages["orgShares"];

export const modelPicker = {
  search: "Rechercher un modèle (nom, gpt, claude…)",
  priceFilter: "Filtrer par prix de token",
  price: "Prix",
  simpleView: "Vue simplifiée",
  simpleViewTip: "Afficher seulement une courte liste de modèles",
  manage: "Gérer les modèles et les clés (Réglages)",
  none: "Aucun modèle",
  models: "Modèles",
  allModels: "Tous les modèles",
  sectionDefault: "Par défaut",
  sectionFavorites: "Favoris",
  sectionCurrent: "Modèle en cours",
  freeTip:
    "Modèle gratuit — inclus avec votre compte, usage limité. Cliquez pour en savoir plus.",
  howToUse: "Comment utiliser ce modèle ?",
  isDefault: "Modèle par défaut des nouvelles conversations",
  setDefault: "Définir comme modèle par défaut",
  addFavorite: "Ajouter aux favoris",
  removeFavorite: "Retirer des favoris",
  defaultSummaryTip: "Voir la fiche de ce modèle",
  defaultSummaryLabel: "Vos nouvelles conversations démarrent sur",
  keySaved: "Clé enregistrée",
  included: "Inclus",
  addKey: "Ajouter une clé",
  local: {
    eyebrow: "Modèle sur votre ordinateur",
    note: "Si vous faites tourner un modèle d'IA sur votre propre ordinateur (avec Ollama, LM Studio…), indiquez son adresse ici.",
    label: "Adresse du modèle",
    idsLabel: "Modèles supplémentaires",
    idsHint:
      "La liste du sélecteur est lue sur le serveur lui-même. Ajoutez ici, séparés par des virgules, les identifiants qu'il ne liste pas (un modèle pas encore chargé, un proxy sans liste).",
    idsPlaceholder: "llama3.2, qwen/qwen3-8b",
  },
  cli: {
    claude: {
      title: "Votre abonnement Claude",
      note: "Si vous avez un abonnement Claude et la CLI Claude Code installée, vos conversations peuvent passer par elle — sans clé API. Le masquage s'applique comme partout : le modèle ne voit que des données remplacées.",
      rowTitle: "Utiliser ma CLI Claude Code",
      onDesc:
        "Ajoute « Claude Code » à la liste des modèles. Chaque envoi consomme votre abonnement Claude personnel.",
      missingDesc:
        "CLI introuvable sur cette machine : installez Claude Code et connectez-le à votre compte Claude, puis revenez ici.",
    },
    codex: {
      title: "Votre abonnement ChatGPT",
      note: "Si vous avez un abonnement ChatGPT et la CLI Codex installée, vos conversations peuvent passer par elle — sans clé API. Le masquage s'applique comme partout : le modèle ne voit que des données remplacées.",
      rowTitle: "Utiliser ma CLI Codex",
      onDesc:
        "Ajoute « GPT Codex » à la liste des modèles. Chaque envoi consomme votre abonnement ChatGPT personnel.",
      missingDesc:
        "CLI introuvable sur cette machine : installez-la (npm i -g @openai/codex), connectez-la avec « codex login », puis revenez ici.",
    },
    antigravity: {
      title: "Votre abonnement Google Antigravity",
      note: "Si vous avez un abonnement Antigravity et sa CLI « agy » installée, vos conversations peuvent passer par elle — sans clé API. Le masquage s'applique comme partout : le modèle ne voit que des données remplacées. ⚠️ Ce chemin passe par un logiciel tiers, ce que les conditions d'Antigravity ne prévoient pas : le risque porte sur votre compte Google.",
      rowTitle: "Utiliser ma CLI Antigravity",
      onDesc:
        "Ajoute « Antigravity » à la liste des modèles. Chaque envoi consomme votre abonnement Google personnel ; les connecteurs de l'app y fonctionnent comme sur les autres modèles.",
      missingDesc:
        "CLI introuvable sur cette machine : installez Antigravity, connectez-la à votre compte Google, puis revenez ici.",
    },
    account: {
      title: "Votre compte",
      loading: "Lecture du compte…",
      unavailable: "La CLI n'a pas répondu — est-elle connectée ?",
      plan: (plan) => `Offre : ${plan}`,
      windowOf: (minutes) => (minutes >= 1440 ? `${Math.round(minutes / 1440)} j` : `${Math.round(minutes / 60)} h`),
      quotaUsed: (percent, window) => `${percent} % de la fenêtre ${window} utilisés`,
      resets: (date) => `réinitialisation ${date}`,
      statusOk: "Quota disponible",
      statusWarning: "Quota presque atteint",
      statusExhausted: "Quota épuisé",
      windowName: (window) => (window === "five_hour" ? "fenêtre 5 h" : window === "weekly" ? "fenêtre hebdomadaire" : window),
      lastTurn: "Vu au dernier envoi",
      claudeNoData: "Le quota s'affichera après un premier envoi : cette CLI ne le donne qu'en cours de tour.",
      modelsTitle: "Modèles du compte",
      defaultTag: "défaut",
      noModels: "Liste non fournie par cette CLI.",
      noQuota: "Quota non exposé par cette CLI.",
    },
  },
} satisfies Messages["modelPicker"];

export const leaves = {
  analytics: {
    privacyTitle: "Confidentialité & RGPD",
    local: "en local",
    alwaysOn: "Session & sécurité — toujours actifs",
    usageStats: "Statistiques d'usage",
    essentials: "Essentiels",
    disable: "Désactiver",
    statsOn: "Actives — compteurs et écrans visités, sans contenu.",
    statsOff: "Désactivées — plus aucune statistique n'est envoyée.",
  },
  privacyLevels: {
    custom: "Sur mesure",
    customNote:
      "Vos réglages, catégorie par catégorie. Choisir un niveau ci-dessus les remplacera.",
  },
  demo: { youWrite: "CE QUE VOUS ÉCRIVEZ", modelReceives: "CE QUE LE MODÈLE REÇOIT" },
  toolTrace: "APPEL D'OUTILS",
  conversations: "Conversations",
  offline: "Hors ligne",
  freeModelsNotice: "Vous utilisez les modèles gratuits",
  viewGrid: "Affichage en grille",
  viewList: "Affichage en liste",
  hide: "Masquer",
  display: "Affichage",
  resize: "Redimensionner",
  loading: "Chargement",
  errorBoundary: {
    title: "Une erreur est survenue",
    body: "Un problème inattendu est survenu. Vos données, enregistrées sur votre ordinateur, sont intactes.",
    reload: "Recharger",
    retry: "Réessayer",
  },
  code: {
    csvTable: "Tableau CSV",
    rowsCols: (rows, cols) =>
      `${rows} ligne${rows > 1 ? "s" : ""} · ${cols} colonne${cols > 1 ? "s" : ""}`,
    lines: (n) => `${n} ligne${n > 1 ? "s" : ""}`,
  },
  document: {
    saveFailed: "Enregistrement impossible — votre texte est toujours là.",
    shortcuts: "⌘↵ pour enregistrer · Échap pour annuler",
    seeAll: "Voir tout",
    editorAria: "Contenu du document",
    seePrompt: "Voir le prompt",
  },
  openInPanel: (name) => `Ouvrir ${name} dans le panneau`,
  loadingImage: (name) => `Chargement de ${name}`,
  openImage: (name) => `Consulter ${name}`,
} satisfies Messages["leaves"];
