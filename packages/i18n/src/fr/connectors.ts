/**
 * The FR catalogue's « connectors » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/connectors.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const connectors = {
  exa:
    "Exa est un moteur de recherche web pensé pour l'IA, qui renvoie des résultats et du contenu de pages exploitables par un modèle.",
  tavily:
    "Tavily fournit une API de recherche et d'extraction web en temps réel conçue pour les agents et applications d'IA.",
  firecrawl:
    "Firecrawl transforme n'importe quel site en données propres (Markdown) via son service de scraping et de crawl.",
  notion:
    "Notion est un espace de travail tout-en-un pour les notes, documents, bases de données et wikis d'équipe.",
  airtable:
    "Airtable combine la simplicité d'un tableur avec la puissance d'une base de données pour organiser projets et données d'équipe.",
  superhuman:
    "Superhuman est un client email premium centré sur la vitesse, avec agenda et fonctions d'IA intégrées.",
  linear:
    "Linear est un outil de suivi d'issues et de gestion de projet rapide, taillé pour les équipes produit et ingénierie.",
  atlassian:
    "Atlassian édite Jira et Confluence, des outils de suivi de tickets et de documentation pour les équipes.",
  asana:
    "Asana est une plateforme de gestion du travail pour organiser tâches, projets et objectifs d'équipe.",
  fireflies:
    "Fireflies.ai enregistre, transcrit et résume automatiquement vos réunions et en extrait les actions à mener.",
  monday:
    "monday.com est une plateforme de Work OS pour construire boards, workflows et suivis de projet personnalisés.",
  sentry:
    "Sentry est une plateforme de suivi des erreurs et de monitoring de performance applicative pour développeurs.",
  vercel:
    "Vercel est une plateforme de déploiement et d'hébergement pour applications web front-end (créateur de Next.js).",
  neon:
    "Neon propose une base de données PostgreSQL serverless avec branches et mise à l'échelle automatique.",
  supabase:
    "Supabase est une alternative open-source à Firebase : base Postgres, authentification, stockage et edge functions.",
  semgrep:
    "Semgrep est un outil d'analyse statique open-source pour détecter bugs et failles de sécurité dans le code.",
  stripe:
    "Stripe est une infrastructure de paiement en ligne pour encaisser, facturer et gérer les abonnements.",
  paypal:
    "PayPal est une plateforme mondiale de paiement en ligne et de transfert d'argent.",
  square:
    "Square (Block) fournit des solutions de paiement, de point de vente et de gestion commerciale.",
  close:
    "Close est un CRM de vente pensé pour les équipes commerciales, avec appels, emails et suivi des deals intégrés.",
  intercom:
    "Intercom est une plateforme de relation client : messagerie, support et assistance IA pour les entreprises.",
  attio:
    "Attio est un CRM moderne et flexible pour gérer contacts, sociétés et deals à partir de vos données.",
  zapier:
    "Zapier automatise les tâches en connectant plus de 8000 applications via des workflows sans code.",
  canva:
    "Canva est un outil de design graphique en ligne pour créer visuels, présentations et documents facilement.",
  wix:
    "Wix est une plateforme de création de sites web, boutiques en ligne et réservations, sans code.",
  webflow:
    "Webflow est un constructeur de sites web visuel avec CMS intégré pour concevoir et publier sans coder.",
  dropbox:
    "Dropbox est un service de stockage et de partage de fichiers dans le cloud.",
  huggingface:
    "Hugging Face est la plateforme de référence pour partager modèles d'IA, datasets et applications (Spaces).",
  github:
    "GitHub est la plateforme d'hébergement de code et de collaboration développeur la plus utilisée (Microsoft).",
  "google-calendar":
    "Google Agenda est le service de calendrier et de gestion d'événements de Google.",
  gmail:
    "Gmail est le service de messagerie électronique de Google.",
  "google-drive":
    "Google Drive est le service de stockage et de partage de fichiers dans le cloud de Google.",
  slack:
    "Slack est une plateforme de messagerie d'équipe organisée en canaux (Salesforce).",
  amplitude:
    "Amplitude est une plateforme d'analytics produit pour comprendre les parcours utilisateurs et piloter les fonctionnalités.",
  posthog:
    "PostHog est une plateforme open-source d'analytics produit : événements, replays de sessions et feature flags.",
  apify:
    "Apify est une plateforme de scraping et d'automatisation web, avec une bibliothèque d'Actors prêts à l'emploi.",
  brightdata:
    "Bright Data fournit un accès en temps réel à des données web publiques à grande échelle.",
  cloudflare:
    "Cloudflare fournit le réseau, la sécurité et la plateforme de calcul (Workers) d'une large part du web.",
  netlify:
    "Netlify est une plateforme de déploiement et d'hébergement pour sites et applications web modernes.",
  "prisma-postgres":
    "Prisma Postgres est une base de données PostgreSQL managée, pensée pour l'ORM Prisma.",
  cloudinary:
    "Cloudinary gère, transforme et diffuse images et vidéos pour les sites et applications.",
  jotform:
    "Jotform est un créateur de formulaires en ligne pour collecter réponses, paiements et signatures.",
  websitepublisher:
    "WebsitePublisher.ai crée et publie des sites web complets à partir d'une simple conversation.",
  morningstar:
    "Morningstar est une référence de la recherche financière : données de marché, analyses et notations de fonds.",
  vantage:
    "Vantage centralise et analyse vos coûts cloud (AWS, GCP, Azure…) pour les comprendre et les réduire.",
  synapse:
    "Synapse (Sage Bionetworks) est une plateforme collaborative de partage de données scientifiques et biomédicales.",
  "google-docs":
    "Google Docs est le traitement de texte collaboratif en ligne de Google.",
  "google-sheets":
    "Google Sheets est le tableur collaboratif en ligne de Google.",
  "google-tasks":
    "Google Tasks est le gestionnaire de tâches de Google, intégré à Gmail et Agenda.",
  "google-analytics":
    "Google Analytics mesure l'audience et le trafic de vos sites et applications (GA4).",
  "microsoft-outlook":
    "Outlook est le service de messagerie et d'agenda de Microsoft 365.",
  "microsoft-onedrive":
    "OneDrive est le service de stockage et de partage de fichiers dans le cloud de Microsoft 365.",
  "microsoft-sharepoint":
    "SharePoint héberge les sites d'équipe et bibliothèques de documents de Microsoft 365.",
  "microsoft-teams":
    "Microsoft Teams est la plateforme de collaboration de Microsoft 365 : équipes, canaux et réunions.",
} satisfies Messages["connectors"];
