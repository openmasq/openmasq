/**
 * The FR « runtime » slice, first half — the SOURCE language: tool-step labels and the
 * agent loop's stop notices. Assembled by `./runtime.ts`.
 */
import type { Messages } from "../messages";

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const runtimeTools = {
  intercepted: {
    run_python: "Analyse et génération de fichiers",
    web_fetch_many: "Lecture de pages web",
    load_tools: "Choix des outils",
    suggest_integrations: "Recherche d'un connecteur",
    memory_search: "Recherche dans la mémoire",
  },
  verbs: {
    search: "Recherche",
    read: "Lecture",
    create: "Création",
    update: "Mise à jour",
    send: "Envoi",
    delete: "Suppression",
    cancel: "Annulation",
    run: "Exécution",
    export: "Export",
    import: "Import",
    duplicate: "Duplication",
  },
  nounActions: { details: "Détails", status: "État", account: "Compte", connect: "Connexion" },
  nouns: {
    issue: "ticket", issues: "tickets",
    email: "e-mail", emails: "e-mails",
    thread: "fil", threads: "fils",
    channel: "canal", channels: "canaux",
    file: "fichier", files: "fichiers",
    folder: "dossier", folders: "dossiers",
    event: "événement", events: "événements",
    calendar: "agenda", calendars: "agendas",
    task: "tâche", tasks: "tâches",
    customer: "client", customers: "clients",
    invoice: "facture", invoices: "factures",
    payment: "paiement", payments: "paiements", charge: "paiement", charges: "paiements",
    refund: "remboursement", refunds: "remboursements",
    subscription: "abonnement", subscriptions: "abonnements",
    balance: "solde", balances: "soldes",
    repository: "dépôt", repositories: "dépôts", repo: "dépôt", repos: "dépôts",
    comment: "commentaire", comments: "commentaires",
    user: "utilisateur", users: "utilisateurs",
    member: "membre", members: "membres",
    resource: "ressource", resources: "ressources",
    row: "ligne", rows: "lignes",
    sheet: "feuille", sheets: "feuilles",
    attachment: "pièce jointe", attachments: "pièces jointes",
  },
  browserRow: {
    search: "Recherche web",
    open: "Ouverture d'une page",
    act: "Action sur la page",
    read: "Lecture de la page",
    tabs: "Gestion des onglets",
    close: "Fermeture",
    browse: "Navigation",
  },
  browserLive: {
    search: "Recherche sur le web",
    open: "Navigation web",
    act: "Action sur la page",
    read: "Lecture de la page",
    tabs: "Gestion des onglets",
    browse: "Navigation web",
  },
  openingHost: (host) => `Ouverture de ${host}`,
  connectorRead: {
    gmail: "Recherche dans les e-mails",
    "microsoft-outlook": "Recherche dans Outlook",
    "google-calendar": "Consultation de l'agenda",
    "google-drive": "Recherche dans Google Drive",
    "microsoft-onedrive": "Recherche dans OneDrive",
    "google-docs": "Lecture des documents",
    "google-sheets": "Lecture du tableur",
    "google-tasks": "Lecture des tâches",
    "google-analytics": "Lecture des statistiques",
    notion: "Lecture de Notion",
    slack: "Lecture de Slack",
    github: "Lecture de GitHub",
    linear: "Lecture des tickets Linear",
    stripe: "Lecture de Stripe",
    fireflies: "Lecture des réunions",
    canva: "Lecture de Canva",
    webflow: "Lecture de Webflow",
    exa: "Recherche sur le web",
    tavily: "Recherche sur le web",
    firecrawl: "Lecture de pages web",
  },
  writing: "Écriture",
  chars: (n) => `${n} ${plural(n, "caractère", "caractères")}`,
} satisfies Messages["runtime"]["tools"];

export const runtimeLoop = {
  browserFault:
    "⚠️ Le navigateur intégré n'a pas pu ouvrir de page. La panne vient du navigateur, pas du modèle.\n\n" +
    "Changer de modèle n'y changera rien. Fermez puis rouvrez le navigateur, ou relancez l'app.",
  webStopped: (n) => `⚠️ Recherche interrompue après ${n} ${plural(n, "page consultée", "pages consultées")}.`,
  webNoAnswer:
    "Le modèle a continué à chercher sans trouver de réponse. Elle n'était sur aucune des pages ouvertes.",
  webTips:
    "Pistes : précisez la cible (nom exact, site officiel, ville…), posez une question plus précise, ou donnez directement l'adresse à consulter.",
  hammered: (n, tool) => `⚠️ Limite atteinte : ${n} appels à ${tool} dans le même tour.`,
  stuck: (n) => `⚠️ Boucle d'outils interrompue après ${n} ${plural(n, "appel", "appels")}.`,
  cap: (turns, n) =>
    `⚠️ Limite d'appels d'outils atteinte (${turns} tours, ${n} ${plural(n, "appel", "appels")}) sans réponse finale.`,
  failedVaried: (tool, times) =>
    `${tool} a échoué ${times} fois de suite, sur des entrées différentes. Le modèle a bien varié ses appels. C'est l'outil qui ne répond pas :`,
  failedVariedTips:
    "Pistes : l'action existe (d'autres appels ont abouti), changer de modèle n'y ferait donc rien. Vérifiez que les éléments visés existent encore et que le connecteur a le droit de les lire, puis relancez.",
  failedSame: (tool, times) => `${tool} a échoué ${times} fois sur le même appel :`,
  sameResult: (tool, times) =>
    `${tool} a renvoyé le même résultat ${times} fois. Le modèle relançait le même appel au lieu de changer d'approche.`,
  invalidCall: (tools) => `Le modèle n'a pas réussi à former un appel valide pour : ${tools}.`,
  noConverge: "Le modèle a enchaîné les appels d'outils sans parvenir à une réponse.",
  tips: "Pistes : précisez la demande, essayez un modèle plus capable (Claude, GPT-5.x…), ou vérifiez que le connecteur propose bien cette action.",
  interrupted: "_(Interrompu.)_",
  refusedFakeAddress: (brand) => `Refusé par ${brand} : adresse construite à partir d'une valeur de substitution`,
  refusedDomain: (brand) => `Refusé par ${brand} : domaine non autorisé`,
  refusedDraftOnly: (brand) => `Refusé par ${brand} : brouillon demandé, pas d'envoi`,
  refusedConsultOnly: (brand) => `Refusé par ${brand} : la demande est une consultation`,
  alreadyDone: "déjà effectué",
  attachmentMissing: (name) => `⚠️ Introuvable, ne sera pas envoyé : ${name}`,
} satisfies Messages["runtime"]["loop"];
