/**
 * Per-connector company blurb + official website — the data behind the short
 * "about" block shown at the top of `McpConnectorModal`. Display-only metadata
 * (never secrets); mirrors the side-table shape of `mcpApiKeyHelp.ts`. Keyed by the
 * catalog connector id. Ids absent here simply render no about block (e.g. the
 * local `filesystem` server has no company).
 */
export interface ConnectorInfo {
  /** One concise FR sentence: what the company / product does. */
  about: string;
  /** Official homepage (https). Opened externally from the modal. */
  website: string;
}

export const MCP_CONNECTOR_INFO: Record<string, ConnectorInfo> = {
  exa: {
    about: "Exa est un moteur de recherche web pensé pour l'IA, qui renvoie des résultats et du contenu de pages exploitables par un modèle.",
    website: "https://exa.ai",
  },
  tavily: {
    about: "Tavily fournit une API de recherche et d'extraction web en temps réel conçue pour les agents et applications d'IA.",
    website: "https://tavily.com",
  },
  firecrawl: {
    about: "Firecrawl transforme n'importe quel site en données propres (Markdown) via son service de scraping et de crawl.",
    website: "https://firecrawl.dev",
  },
  notion: {
    about: "Notion est un espace de travail tout-en-un pour les notes, documents, bases de données et wikis d'équipe.",
    website: "https://notion.so",
  },
  airtable: {
    about: "Airtable combine la simplicité d'un tableur avec la puissance d'une base de données pour organiser projets et données d'équipe.",
    website: "https://airtable.com",
  },
  superhuman: {
    about: "Superhuman est un client email premium centré sur la vitesse, avec agenda et fonctions d'IA intégrées.",
    website: "https://superhuman.com",
  },
  linear: {
    about: "Linear est un outil de suivi d'issues et de gestion de projet rapide, taillé pour les équipes produit et ingénierie.",
    website: "https://linear.app",
  },
  atlassian: {
    about: "Atlassian édite Jira et Confluence, des outils de suivi de tickets et de documentation pour les équipes.",
    website: "https://atlassian.com",
  },
  asana: {
    about: "Asana est une plateforme de gestion du travail pour organiser tâches, projets et objectifs d'équipe.",
    website: "https://asana.com",
  },
  fireflies: {
    about: "Fireflies.ai enregistre, transcrit et résume automatiquement vos réunions et en extrait les actions à mener.",
    website: "https://fireflies.ai",
  },
  monday: {
    about: "monday.com est une plateforme de Work OS pour construire boards, workflows et suivis de projet personnalisés.",
    website: "https://monday.com",
  },
  sentry: {
    about: "Sentry est une plateforme de suivi des erreurs et de monitoring de performance applicative pour développeurs.",
    website: "https://sentry.io",
  },
  vercel: {
    about: "Vercel est une plateforme de déploiement et d'hébergement pour applications web front-end (créateur de Next.js).",
    website: "https://vercel.com",
  },
  neon: {
    about: "Neon propose une base de données PostgreSQL serverless avec branches et mise à l'échelle automatique.",
    website: "https://neon.tech",
  },
  supabase: {
    about: "Supabase est une alternative open-source à Firebase : base Postgres, authentification, stockage et edge functions.",
    website: "https://supabase.com",
  },
  semgrep: {
    about: "Semgrep est un outil d'analyse statique open-source pour détecter bugs et failles de sécurité dans le code.",
    website: "https://semgrep.dev",
  },
  stripe: {
    about: "Stripe est une infrastructure de paiement en ligne pour encaisser, facturer et gérer les abonnements.",
    website: "https://stripe.com",
  },
  paypal: {
    about: "PayPal est une plateforme mondiale de paiement en ligne et de transfert d'argent.",
    website: "https://paypal.com",
  },
  square: {
    about: "Square (Block) fournit des solutions de paiement, de point de vente et de gestion commerciale.",
    website: "https://squareup.com",
  },
  close: {
    about: "Close est un CRM de vente pensé pour les équipes commerciales, avec appels, emails et suivi des deals intégrés.",
    website: "https://close.com",
  },
  intercom: {
    about: "Intercom est une plateforme de relation client : messagerie, support et assistance IA pour les entreprises.",
    website: "https://intercom.com",
  },
  attio: {
    about: "Attio est un CRM moderne et flexible pour gérer contacts, sociétés et deals à partir de vos données.",
    website: "https://attio.com",
  },
  zapier: {
    about: "Zapier automatise les tâches en connectant plus de 8000 applications via des workflows sans code.",
    website: "https://zapier.com",
  },
  canva: {
    about: "Canva est un outil de design graphique en ligne pour créer visuels, présentations et documents facilement.",
    website: "https://canva.com",
  },
  wix: {
    about: "Wix est une plateforme de création de sites web, boutiques en ligne et réservations, sans code.",
    website: "https://wix.com",
  },
  webflow: {
    about: "Webflow est un constructeur de sites web visuel avec CMS intégré pour concevoir et publier sans coder.",
    website: "https://webflow.com",
  },
  dropbox: {
    about: "Dropbox est un service de stockage et de partage de fichiers dans le cloud.",
    website: "https://dropbox.com",
  },
  huggingface: {
    about: "Hugging Face est la plateforme de référence pour partager modèles d'IA, datasets et applications (Spaces).",
    website: "https://huggingface.co",
  },
  github: {
    about: "GitHub est la plateforme d'hébergement de code et de collaboration développeur la plus utilisée (Microsoft).",
    website: "https://github.com",
  },
  "google-calendar": {
    about: "Google Agenda est le service de calendrier et de gestion d'événements de Google.",
    website: "https://calendar.google.com",
  },
  gmail: {
    about: "Gmail est le service de messagerie électronique de Google.",
    website: "https://mail.google.com",
  },
  "google-drive": {
    about: "Google Drive est le service de stockage et de partage de fichiers dans le cloud de Google.",
    website: "https://drive.google.com",
  },
  slack: {
    about: "Slack est une plateforme de messagerie d'équipe organisée en canaux (Salesforce).",
    website: "https://slack.com",
  },
  amplitude: {
    about: "Amplitude est une plateforme d'analytics produit pour comprendre les parcours utilisateurs et piloter les fonctionnalités.",
    website: "https://amplitude.com",
  },
  posthog: {
    about: "PostHog est une plateforme open-source d'analytics produit : événements, replays de sessions et feature flags.",
    website: "https://posthog.com",
  },
  apify: {
    about: "Apify est une plateforme de scraping et d'automatisation web, avec une bibliothèque d'Actors prêts à l'emploi.",
    website: "https://apify.com",
  },
  brightdata: {
    about: "Bright Data fournit un accès en temps réel à des données web publiques à grande échelle.",
    website: "https://brightdata.com",
  },
  cloudflare: {
    about: "Cloudflare fournit le réseau, la sécurité et la plateforme de calcul (Workers) d'une large part du web.",
    website: "https://cloudflare.com",
  },
  netlify: {
    about: "Netlify est une plateforme de déploiement et d'hébergement pour sites et applications web modernes.",
    website: "https://netlify.com",
  },
  "prisma-postgres": {
    about: "Prisma Postgres est une base de données PostgreSQL managée, pensée pour l'ORM Prisma.",
    website: "https://prisma.io",
  },
  cloudinary: {
    about: "Cloudinary gère, transforme et diffuse images et vidéos pour les sites et applications.",
    website: "https://cloudinary.com",
  },
  jotform: {
    about: "Jotform est un créateur de formulaires en ligne pour collecter réponses, paiements et signatures.",
    website: "https://jotform.com",
  },
  websitepublisher: {
    about: "WebsitePublisher.ai crée et publie des sites web complets à partir d'une simple conversation.",
    website: "https://websitepublisher.ai",
  },
  morningstar: {
    about: "Morningstar est une référence de la recherche financière : données de marché, analyses et notations de fonds.",
    website: "https://morningstar.com",
  },
  vantage: {
    about: "Vantage centralise et analyse vos coûts cloud (AWS, GCP, Azure…) pour les comprendre et les réduire.",
    website: "https://vantage.sh",
  },
  synapse: {
    about: "Synapse (Sage Bionetworks) est une plateforme collaborative de partage de données scientifiques et biomédicales.",
    website: "https://synapse.org",
  },
  "google-docs": {
    about: "Google Docs est le traitement de texte collaboratif en ligne de Google.",
    website: "https://docs.google.com",
  },
  "google-sheets": {
    about: "Google Sheets est le tableur collaboratif en ligne de Google.",
    website: "https://sheets.google.com",
  },
  "google-tasks": {
    about: "Google Tasks est le gestionnaire de tâches de Google, intégré à Gmail et Agenda.",
    website: "https://tasks.google.com",
  },
  "google-analytics": {
    about: "Google Analytics mesure l'audience et le trafic de vos sites et applications (GA4).",
    website: "https://analytics.google.com",
  },
  "microsoft-outlook": {
    about: "Outlook est le service de messagerie et d'agenda de Microsoft 365.",
    website: "https://outlook.com",
  },
  "microsoft-onedrive": {
    about: "OneDrive est le service de stockage et de partage de fichiers dans le cloud de Microsoft 365.",
    website: "https://microsoft.com/microsoft-365/onedrive/online-cloud-storage",
  },
  "microsoft-sharepoint": {
    about: "SharePoint héberge les sites d'équipe et bibliothèques de documents de Microsoft 365.",
    website: "https://microsoft.com/microsoft-365/sharepoint/collaboration",
  },
  "microsoft-teams": {
    about: "Microsoft Teams est la plateforme de collaboration de Microsoft 365 : équipes, canaux et réunions.",
    website: "https://microsoft.com/microsoft-teams",
  },
};

/** The company blurb + website for a connector id, or undefined when none. */
export function connectorInfo(id: string): ConnectorInfo | undefined {
  return MCP_CONNECTOR_INFO[id];
}
