/**
 * Le catalogue FRANÇAIS — la langue SOURCE (le code est écrit en français, les messages
 * les plus travaillés — refus, `redact` — le sont d'abord ici, `en.ts` les traduit).
 *
 * `satisfies Messages` : le compilateur exige EXACTEMENT les clés du contrat, ni plus ni
 * moins. Ajouter une entrée sans la déclarer dans `messages.ts` est une erreur ; en
 * oublier une aussi.
 */
import type { Messages } from "./messages";

export const fr = {
  common: {
    cancel: "Annuler",
    save: "Enregistrer",
    close: "Fermer",
    retry: "Réessayer",
    delete: "Supprimer",
    confirm: "Confirmer",
    loading: "Chargement…",
    genericError: "Une erreur est survenue. Réessayez.",
  },
  nav: {
    ariaLabel: "Navigation",
    chats: "Chats",
    competences: "Compét.",
    memory: "Mémoire",
    vault: "Coffre",
    library: "Biblio",
    settings: "Réglages",
  },
  billing: {
    checkoutOpenFailed: "Impossible d'ouvrir la page de paiement. Réessayez.",
  },
  chrome: {
    expandSidebar: "Développer la barre latérale",
    newChat: "Nouvelle conversation",
    search: "Rechercher",
    searchShortcut: "Rechercher (⌘K)",
    memoryFresh: "Mémoire — nouveaux souvenirs notés",
    privacyReportTip: (n) => `${n} élément(s) protégé(s) — rapport de confidentialité`,
    privacyReport: "Rapport de confidentialité",
    account: "Compte et paramètres",
    conversations: "Conversations",
    noConversations: "Aucune conversation pour le moment.",
    you: "Vous",
    privateSpace: "Espace privé",
    private: "Privé",
    launchPinned: (what) => `Lancer : ${what}`,
    deleteConversationAction: "Supprimer la conversation",
    deleteConversation: "Supprimer cette conversation ?",
    deleteConversationBody: (title) =>
      `« ${title} » et tous ses messages seront supprimés de cet appareil. Cette action est définitive.`,
    untitledConversation: "Nouvelle conversation",
  },
  sections: {
    chats: {
      label: "Conversations",
      tip: "Conversations — vos échanges avec les modèles",
      guide: (brand) =>
        `C'est ici que vous écrivez. Tapez comme vous parlez : ${brand} masque les données sensibles avant l'envoi, et rétablit vos vraies valeurs dans la réponse. Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer à tout moment.`,
      keywords: "chat conversation discussion message écrire nouvelle",
    },
    library: {
      label: "Bibliothèque",
      tip: "Bibliothèque — les fichiers de vos conversations, déjà masqués",
      subtitle: "Tous les fichiers et images de vos conversations, protégés et prêts à réutiliser.",
      guide:
        "Chaque image et document partagé dans une conversation atterrit ici automatiquement, déjà masqué. Vous les retrouvez par type, et vous les réutilisez ailleurs en un clic.",
      keywords: "fichiers documents images pièces jointes pdf téléchargements library",
    },
    competences: {
      label: "Compétences",
      tip: "Compétences — vos instructions réutilisables",
      subtitle:
        "Vos instructions réutilisables, rangées par catégorie. Utilisez-en une en un clic, ou tapez / dans la zone de message.",
      guide:
        "Une bonne instruction que vous réécrivez souvent — une réponse type, une traduction, un résumé — s'enregistre une fois et se réutilise partout. Certaines mettent en plus vos services connectés au travail (« rassemble mes e-mails importants de la semaine et prépare un résumé ») : ce sont les Routines, une catégorie comme une autre. Tapez / dans la zone de message pour en utiliser une.",
      keywords:
        "prompts instructions modèles de message raccourcis skills routines workflows automatisation connecteurs outils",
    },
    memory: {
      label: "Mémoire",
      tip: (brand) => `Mémoire — ce que ${brand} retient d'une fois sur l'autre`,
      subtitle: (brand) =>
        `Ce que ${brand} retient d'une conversation à l'autre, pour ne pas avoir à vous répéter.`,
      guide:
        "Pour ne pas réexpliquer chaque fois qui est ce client ou où en est ce projet. Dites « retiens que… » dans une conversation, sélectionnez un passage et choisissez « Retenir », ou créez une fiche ici. Tout reste sur votre machine, et part masqué comme le reste.",
      keywords: "souvenirs fiches profil se souvenir retenir contexte",
    },
    vault: {
      label: "Coffre",
      tip: "Coffre — les mots à masquer dans tous vos échanges",
      subtitle:
        "Vos termes toujours masqués — noms de code, comptes, identifiants — remplacés avant chaque envoi, quel que soit le modèle.",
      guide: (brand) =>
        `Vos mots à vous : un nom de code, un numéro de compte, un identifiant. Ajoutez-les une fois, et ${brand} les masque dans tous vos envois, sans exception.`,
      keywords: "masquer toujours termes mots secrets noms de code vault coffre-fort",
    },
    helpEntry: {
      title: (brand) => `Aide — prendre en main ${brand}`,
      sub: (brand) => `Le masquage, les mots de ${brand}, et à quoi sert chaque section.`,
      keywords:
        "aide guide aidez-moi comment ça marche débuter démarrer tutoriel manuel documentation help",
    },
  },
  chat: {
    backToConversations: "Retour aux conversations",
    toggleSidebar: "Basculer la barre latérale",
    more: "Plus",
    rowActions: "Actions",
    rename: "Renommer",
    renameConversation: "Renommer la conversation",
    generating: "Génération en cours",
    closeTab: "Fermer l'onglet",
    hiddenTabsTip: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue — faire défiler`,
    hiddenTabs: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue`,
    splitScreen: "Diviser l'écran",
    splitLeft: "À gauche",
    splitRight: "À droite",
    redactionSummary: (n) => `Redaction · ${n} protégé${n === 1 ? "" : "s"}`,
    seeWhatTheModelSaw: "Voir ce que le modèle a vu",
    debugLog: "Journal de débogage",
  },
  settings: {
    appearance: {
      title: "Apparence",
      darkModeLabel: "Mode sombre",
      darkModeHint: "Passe l'application en couleurs sombres.",
    },
    tabs: {
      account: {
        label: "Compte",
        title: "Compte",
        sub: () => "Votre identité sur cet appareil, l'apparence et vos données.",
        kw: "profil nom email adresse thème sombre dark mode clé api key redaction règles catégories modèle défaut préférences déconnexion langue",
      },
      privacy: {
        label: "Confidentialité",
        title: "Confidentialité",
        sub: (brand) => `Ce que ${brand} protège avant qu'un modèle ne le reçoive.`,
        kw: "redaction confidentialite privacy protection categories regles niveau standard strict sur mesure jetons pseudonymes rapport donnees protegees",
      },
      models: {
        label: "Modèles",
        title: "Liste de modèles",
        sub: () => "Les modèles que vos accès ouvrent — plus un modèle local sur votre machine.",
        kw: "modele defaut gpt claude gemini mistral deepseek llm fournisseur provider cle api local ollama lm studio adresse localhost",
      },
      mcp: {
        label: "Connecteurs",
        title: "Connecteurs & outils",
        sub: () => "Les connecteurs disponibles dans vos conversations.",
        kw: "connecteurs intégrations gmail notion stripe github slack outils tools serveur oauth",
      },
      browser: {
        label: "Navigateur",
        title: "Navigateur",
        sub: () => "Le navigateur intégré que le modèle peut piloter, sous votre contrôle.",
        kw: "web recherche moteur duckduckgo google agent navigation sécurité",
      },
      audit: {
        label: "Journal",
        title: "Journal d'audit",
        sub: () => "L'historique du redaction, filtrable et recherchable.",
        kw: "log historique sécurité traçabilité rédaction masquage export",
      },
      usage: {
        label: "Usage",
        title: "Usage",
        sub: () => "Votre consommation, au total et par modèle.",
        kw: "consommation crédits cout dépense tokens jetons quota statistiques",
      },
      sync: {
        label: "Vos appareils",
        title: "Synchronisation",
        sub: () => "Vos appareils et la synchronisation entre eux.",
        kw: "appareils devices cloud chiffrement sauvegarde",
      },
      org: {
        label: "Organisation",
        title: "Organisation",
        sub: () => "L'organisation à laquelle appartient ce compte.",
        kw: "équipe team membres domaine sso entreprise administration",
      },
      billing: {
        label: "Paiement",
        title: "Paiement",
        sub: () => "Votre abonnement, les crédits inclus et la facturation.",
        kw: "facture stripe carte abonnement plan prix tarif reçu portail",
      },
      versions: {
        label: "Versions",
        title: "Versions",
        sub: () => "Les canaux de version et les notes de mise à jour.",
        kw: "changelog mise a jour update beta stable release notes canal nouveautés",
      },
    },
    entries: {
      darkMode: { label: "Mode sombre", kw: "sombre dark theme apparence nuit couleur" },
      importConversations: {
        label: "Importer des conversations",
        kw: "import chatgpt claude export historique",
      },
      messageBilling: {
        label: "Facturation des messages",
        kw: "abonnement credits cle byo propre compte payer",
      },
      notifyOnReply: {
        label: "Prévenir quand une réponse arrive",
        kw: "notification systeme banniere alerte reponse prete second plan",
      },
      anonymousStats: {
        label: "Statistiques d'usage anonymes",
        kw: "analytics telemetrie consentement anonymes",
      },
      transparencyLog: {
        label: "Transparence · journal technique",
        kw: "transparence debogage debug journal wire message exact modele vu par le modele comparatif",
      },
      linkPreviews: { label: "Aperçus de liens", kw: "lien preview vignette apercu url ip" },
      protectionLevel: {
        label: "Niveau de protection",
        kw: "niveau standard strict sur mesure categories regles redaction",
      },
      showTokens: {
        label: "Afficher des jetons plutôt que des pseudonymes",
        kw: "jetons pseudonymes person1 iban affichage",
      },
      modelSeesTokens: {
        label: "Le modèle ne voit que des jetons",
        kw: "jetons marqueurs pseudonymes modèle anonymisation person1 envoi",
      },
      localModel: {
        label: "Modèle sur votre ordinateur",
        kw: "local ollama lm studio localhost adresse openai compatible",
      },
      favouriteModels: {
        label: "Modèles favoris",
        kw: "favoris favori etoile liste courte selecteur personnaliser epingler raccourci",
      },
      claudeSubscription: {
        label: "Votre abonnement Claude",
        kw: "claude code cli abonnement anthropic sans cle subscription",
      },
      chatgptSubscription: {
        label: "Votre abonnement ChatGPT",
        kw: "codex cli openai chatgpt abonnement sans cle subscription",
      },
      writeConfirm: {
        label: "Confirmation des actions",
        kw: "confirmation ecriture write gate renforce outils",
      },
      connectedDevices: {
        label: "Appareils connectés",
        kw: "appareils devices synchro revoquer passphrase",
      },
      environment: {
        label: "Environnement",
        kw: "environnement staging production basculer beta test acces",
      },
    },
    groups: {
      account: "Compte",
      privacy: "Confidentialité",
      aiTools: "IA & outils",
      devices: "Vos appareils",
      org: "Organisation",
      app: "Application",
      other: "Autres",
    },
    inTab: (tabTitle) => `Dans « ${tabTitle} »`,
  },
  language: {
    label: "Langue",
    hint: "La langue de l'application. Vos conversations gardent celle dans laquelle vous écrivez.",
    names: { fr: "Français", en: "English" },
  },
} satisfies Messages;
