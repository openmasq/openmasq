/**
 * The FR catalogue's « byo » slice — the SOURCE language: « Mes clés » — the BYO form and its three tutorials.
 */
import type { Messages } from "../messages";

export const byo = {
  eyebrow: "MES CLÉS",
  connect: "Connecter",
  encryptedNote: "Vos identifiants sont enregistrés chiffrés sur cet ordinateur.",
  existing:
    "Des identifiants sont déjà enregistrés sur cet ordinateur. Laissez les champs vides pour les réutiliser, ou saisissez-en de nouveaux pour les remplacer.",
  onceLead: "À faire une seule fois.",
  onceTail: (family, others) =>
    ` Les identifiants créés ici serviront aussi à vos autres services ${family} (${others}).`,
  stepDone: (n) => `Marquer l'étape ${n} comme non faite`,
  stepTodo: (n) => `Marquer l'étape ${n} comme faite`,
  markDone: "Marquer cette étape comme faite",
  clientId: "ID client",
  clientSecret: "Code secret du client",
  keepPlaceholder: "•••• enregistré. Laissez vide pour le conserver",
  cancel: "Annuler",
  connecting: "Connexion…",
  keepAndConnect: "Conserver et connecter",
  noSpaces: "Un ID client ne contient pas d'espace. Vérifiez ce que vous avez collé.",
  isApiKeyNotClientId:
    "Ceci est une clé d'API, pas un ID client. L'ID client vient de « Créer un ID client OAuth ».",
  googleSuffix: "Un ID client Google se termine par « .apps.googleusercontent.com ».",
  microsoftGuid:
    "L'ID d'application Microsoft est de la forme 00000000-0000-0000-0000-000000000000.",
  secretNoSpaces: "Un code secret ne contient pas d'espace. Vérifiez ce que vous avez collé.",
  secretIsClientId: "Ceci est l'ID client. Le code secret est la seconde valeur.",
  secretPrefixWarn:
    "Les codes secrets Google commencent en général par « GOCSPX- ». Vérifiez que c'est bien le code secret du client.",
  microsoft: {
    intro:
      "≈ 3 min. Une inscription d'application Microsoft Entra. Les autorisations sont accordées à la connexion.",
    note: "L'adresse « http://127.0.0.1/callback » désigne votre propre ordinateur. Le port n'a pas d'importance.",
    s1: { lead: "Ouvrez le portail Microsoft Entra : ", link: "Inscrire une application" },
    s2: {
      a: "Nommez-la « ",
      b: " », puis sous ",
      c: "« Types de comptes pris en charge »",
      d: " choisissez « Comptes dans un annuaire organisationnel quelconque et comptes Microsoft personnels » (comptes professionnels et comptes personnels comme Outlook.com).",
    },
    s3: {
      a: "Sous ",
      b: "« URI de redirection »",
      c: ", sélectionnez la plateforme « Applications de bureau et mobiles » et saisissez ",
      d: "http://127.0.0.1/callback",
      e: ", puis cliquez sur « S'inscrire ». (Vous pouvez aussi l'ajouter plus tard dans l'onglet « Authentification ».)",
    },
    s4: {
      a: "Sur la page ",
      b: "« Vue d'ensemble »",
      c: ", copiez l'« ID d'application (client) » et collez-le ci-dessous. ",
      d: "Aucun secret nécessaire",
    },
  },
  github: {
    intro: "≈ 1 min. Aucune vérification d'application nécessaire.",
    s1: {
      lead: "Créez une app OAuth GitHub : ",
      link: "Nouvelle OAuth App",
      tail: (brand) =>
        `. Nom : « ${brand} ». Les champs Homepage et Callback URL acceptent n'importe quelle valeur (ils ne servent pas en device flow).`,
    },
    s2: {
      a: "Sur la page de l'app, cochez ",
      b: "« Enable Device Flow »",
      c: ", puis enregistrez.",
    },
    s3: {
      a: "Copiez le ",
      b: "Client ID",
      c: " (en haut de la page) et collez-le ci-dessous. ",
      d: "Aucun secret nécessaire",
    },
  },
  google: {
    intro:
      "≈ 3 min. En gardant l'application en mode test, vous avez toutes les fonctionnalités sans la vérification de Google.",
    note: "L'adresse « 127.0.0.1 » (votre ordinateur) est autorisée automatiquement pour une application de bureau.",
    s1: { lead: "Créez ou choisissez un projet : ", link: "Nouveau projet Google Cloud" },
    s2: {
      enableOne: "Activez l'API : ",
      enableMany: "Activez les API : ",
      and: " et ",
      tailOne: " → bouton « Activer ».",
      tailMany: " → bouton « Activer » pour chacune.",
    },
    s3: {
      a: "Ouvrez l'",
      link: "écran de consentement OAuth",
      b: " → type ",
      c: "« Externe »",
      d: ", puis dans « Utilisateurs test » ajoutez votre adresse Google",
      e: " (cela évite la vérification de Google).",
    },
    s4: {
      a: "Créez les identifiants : ",
      link: "Créer un ID client OAuth",
      b: " → type d'application ",
      c: "« Application de bureau ».",
    },
    s5: {
      a: "Copiez l'",
      b: "ID client",
      c: " et le ",
      d: "Code secret du client",
      e: " et collez-les ci-dessous.",
    },
  },
} satisfies Messages["byo"];
