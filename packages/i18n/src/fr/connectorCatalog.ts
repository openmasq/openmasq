/**
 * Tranche « connectorCatalog » du catalogue FR — la langue SOURCE. Générée depuis
 * `@openmasq/catalog` : la `desc` y reste (le modèle la lit), celle-ci est celle qu'on LIT.
 * `satisfies` par entrée.
 */
import type { Messages } from "../messages";

export const connectorCatalog = {
  connectors: {
    demo: { desc: "Bac à sable de démonstration (données d'exemple, sans compte)" },
    gmail: { desc: "Lire, rechercher et envoyer vos emails" },
    slack: { desc: "Lister les canaux et lire les messages récents" },
    github: { desc: "Repositories & issues" },
    "google-calendar": { name: "Google Agenda", desc: "Événements & rendez-vous" },
    "google-drive": { desc: "Rechercher, lire et déposer des fichiers Drive" },
    "google-docs": { desc: "Créer, lire et compléter vos documents Google Docs" },
    "google-sheets": { desc: "Lire des plages, ajouter des lignes et créer des classeurs" },
    "google-tasks": { desc: "Lister, créer et terminer vos tâches" },
    "google-analytics": { desc: "Propriétés GA4 & rapports de trafic (lecture)" },
    "microsoft-outlook": { desc: "Rechercher, lire et envoyer des emails Outlook" },
    "microsoft-onedrive": { desc: "Rechercher et lire vos fichiers OneDrive" },
    "microsoft-sharepoint": { desc: "Rechercher et lire vos sites et bibliothèques SharePoint" },
    "microsoft-teams": { desc: "Équipes, canaux et messages Teams" },
    exa: { desc: "Recherche web & code, crawl de pages" },
    tavily: { desc: "Recherche web temps réel + extraction/crawl" },
    firecrawl: { desc: "Scraping & crawl de sites en Markdown" },
    notion: { desc: "Rechercher, lire et créer vos pages et bases Notion" },
    superhuman: { desc: "Rechercher, lire et envoyer des emails, agenda" },
    linear: { desc: "Créer et suivre issues, projets et cycles" },
    atlassian: { desc: "Rechercher et gérer tickets Jira et pages Confluence" },
    asana: { desc: "Gérer tâches, projets et portfolios" },
    fireflies: { desc: "Transcriptions, résumés & actions de réunions" },
    monday: { desc: "Lire et mettre à jour vos boards et items" },
    sentry: { desc: "Consulter erreurs, issues et releases" },
    vercel: { desc: "Suivre déploiements, projets et logs" },
    neon: { desc: "Interroger vos bases Postgres serverless" },
    supabase: { desc: "Base de données, edge functions, logs" },
    semgrep: { desc: "Analyser la sécurité de votre code" },
    stripe: { desc: "Consulter paiements, clients et factures" },
    paypal: { desc: "Consulter paiements, factures et commandes" },
    square: { desc: "Consulter paiements, catalogue et commandes" },
    close: { desc: "CRM : gérer leads, contacts et opportunités" },
    intercom: { desc: "Consulter conversations, contacts et tickets" },
    attio: { desc: "CRM : contacts, sociétés, deals, notes" },
    zapier: { desc: "Déclencher des automatisations sur 8000+ apps" },
    canva: { desc: "Créer et exporter vos designs Canva" },
    wix: { desc: "Gérer sites, boutiques et réservations" },
    webflow: { desc: "Gérer sites, CMS et pages" },
    dropbox: { desc: "Rechercher et lire vos fichiers Dropbox" },
    huggingface: { desc: "Explorer modèles, datasets et Spaces" },
    amplitude: { desc: "Analytics produit, dashboards, expériences & feature flags" },
    posthog: { desc: "Analytics produit, insights, dashboards & feature flags" },
    apify: { desc: "Scraping & automatisation via la bibliothèque d'Actors" },
    brightdata: { desc: "Accès temps réel à des données web publiques" },
    cloudflare: { desc: "Workers, stockage, IA & primitives de calcul" },
    netlify: { desc: "Déployer, gérer et sécuriser des sites Netlify" },
    "prisma-postgres": { desc: "Interroger & gérer votre base Prisma Postgres" },
    cloudinary: { desc: "Gestion & transformation d'images et de vidéos" },
    jotform: { desc: "Créer des formulaires & analyser les réponses" },
    websitepublisher: { desc: "Créer et publier des sites par conversation" },
    morningstar: { desc: "Données d'investissement & de marché" },
    vantage: { desc: "Analyse de vos coûts cloud" },
    synapse: { desc: "Recherche & métadonnées de données scientifiques" },
    airtable: { desc: "Bases, tables et enregistrements : lire, créer et mettre à jour" },
    filesystem: { desc: "Lire/écrire des fichiers dans un dossier autorisé (serveur local)" },
    browser: {
      name: "Navigateur",
      desc: "Laisser le modèle agir dans un navigateur (remplir des formulaires, cliquer) sur vos sites connectés.",
    },
  },
  categories: {
    search: "Recherche & web",
    dev: "Développement",
    data: "Données & stockage",
    productivity: "Productivité",
    crm: "CRM & support",
    finance: "Finance & paiements",
    design: "Design & sites",
    automation: "Automatisation",
    ai: "IA & modèles",
    other: "Autres",
  },
  auth: {
    builtin: {
      label: "Intégré",
      title:
        "Fourni avec l'application : rien à connecter, rien à payer, aucun compte à relier. Il suffit de l'activer.",
    },
    directFull:
      "La page de connexion du service s'ouvre : vous acceptez, et c'est fini. Rien à copier-coller, aucune clé à créer.",
    byoOnly: {
      label: "Vos clés",
      title: (what, reason) => `Pour ${what}, vos propres clés sont nécessaires — ${reason}.`,
    },
    byoLimited: {
      label: "1-clic limité",
      title: (what, reason) =>
        `Connexion en un clic, rien à créer. Pour ${what}, vos propres clés seront nécessaires — ${reason}.`,
    },
    device: {
      label: "Appareil",
      title: "Un code à saisir sur le site du service, et c'est fini. Aucune clé à créer.",
    },
    oneClick: "1-clic",
    local: {
      label: "Local",
      title:
        "Cet outil tourne sur votre machine : vos dossiers et vos identifiants restent chez vous, et ne sont jamais envoyés au modèle.",
    },
    broker: {
      label: (brand) => `Via ${brand}`,
      title: (brand) =>
        `Vous vous connectez à votre compte, et ${brand} s'occupe du reste : rien à créer, aucun code à coller.`,
    },
    apikey: {
      label: "Clé requise",
      title:
        "Ce service demande une clé, à récupérer sur son site puis à coller ici. Il n'y a pas de page de connexion.",
    },
    oneClickRemote: {
      label: "1-clic",
      title:
        "La page de connexion du service s'ouvre dans votre navigateur : vous acceptez, et c'est fini. Rien à créer.",
    },
    byoSafe: (brand) =>
      `Vos identifiants restent chiffrés sur votre appareil et ne passent par aucun serveur ${brand}.`,
    reasonAdminConsent: "seul un administrateur de votre organisation peut l'autoriser",
    reasonGoogleReview: (brand) =>
      `Google vérifie encore ${brand} avant d'ouvrir cet accès en un clic (en cours)`,
    thisAccess: "cet accès",
  },
} satisfies Messages["connectorCatalog"];
