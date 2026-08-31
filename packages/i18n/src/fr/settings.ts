/**
 * The FR catalogue's « settings » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/settings.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const settings = {
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
      kw: "abonnement credits cle byo propre compte payer inclus",
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
} satisfies Messages["settings"];
