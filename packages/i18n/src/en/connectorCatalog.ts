/**
 * The EN catalogue's « connectorCatalog » slice — translated from the source (`../fr/connectorCatalog.ts`).
 * `satisfies` per entry.
 */
import type { Messages } from "../messages";

export const connectorCatalog = {
  connectors: {
    demo: { desc: "Demo sandbox (sample data, no account)" },
    gmail: { desc: "Read, search and send your emails" },
    slack: { desc: "List channels and read recent messages" },
    github: { desc: "Repositories & issues" },
    "google-calendar": { name: "Google Calendar", desc: "Events & appointments" },
    "google-drive": { desc: "Search, read and upload Drive files" },
    "google-docs": { desc: "Create, read and extend your Google Docs" },
    "google-sheets": { desc: "Read ranges, append rows and create spreadsheets" },
    "google-tasks": { desc: "List, create and complete your tasks" },
    "google-analytics": { desc: "GA4 properties & traffic reports (read-only)" },
    "microsoft-outlook": { desc: "Search, read and send Outlook emails" },
    "microsoft-onedrive": { desc: "Search and read your OneDrive files" },
    "microsoft-sharepoint": { desc: "Search and read your SharePoint sites and libraries" },
    "microsoft-teams": { desc: "Teams, channels and Teams messages" },
    exa: { desc: "Web & code search, page crawling" },
    tavily: { desc: "Real-time web search + extraction/crawl" },
    firecrawl: { desc: "Scrape & crawl sites into Markdown" },
    notion: { desc: "Search, read and create your Notion pages and databases" },
    superhuman: { desc: "Search, read and send emails, calendar" },
    linear: { desc: "Create and track issues, projects and cycles" },
    atlassian: { desc: "Search and manage Jira tickets and Confluence pages" },
    asana: { desc: "Manage tasks, projects and portfolios" },
    fireflies: { desc: "Meeting transcripts, summaries & action items" },
    monday: { desc: "Read and update your boards and items" },
    sentry: { desc: "Browse errors, issues and releases" },
    vercel: { desc: "Track deployments, projects and logs" },
    neon: { desc: "Query your serverless Postgres databases" },
    supabase: { desc: "Database, edge functions, logs" },
    semgrep: { desc: "Analyse your code's security" },
    stripe: { desc: "Browse payments, customers and invoices" },
    paypal: { desc: "Browse payments, invoices and orders" },
    square: { desc: "Browse payments, catalogue and orders" },
    close: { desc: "CRM: manage leads, contacts and opportunities" },
    intercom: { desc: "Browse conversations, contacts and tickets" },
    attio: { desc: "CRM: contacts, companies, deals, notes" },
    zapier: { desc: "Trigger automations across 8,000+ apps" },
    canva: { desc: "Create and export your Canva designs" },
    wix: { desc: "Manage sites, stores and bookings" },
    webflow: { desc: "Manage sites, CMS and pages" },
    dropbox: { desc: "Search and read your Dropbox files" },
    huggingface: { desc: "Explore models, datasets and Spaces" },
    amplitude: { desc: "Product analytics, dashboards, experiments & feature flags" },
    posthog: { desc: "Product analytics, insights, dashboards & feature flags" },
    apify: { desc: "Scraping & automation through the Actor library" },
    brightdata: { desc: "Real-time access to public web data" },
    cloudflare: { desc: "Workers, storage, AI & compute primitives" },
    netlify: { desc: "Deploy, manage and secure Netlify sites" },
    "prisma-postgres": { desc: "Query & manage your Prisma Postgres database" },
    cloudinary: { desc: "Image and video management & transformation" },
    jotform: { desc: "Build forms & analyse responses" },
    websitepublisher: { desc: "Build and publish sites through conversation" },
    morningstar: { desc: "Investment & market data" },
    vantage: { desc: "Analysis of your cloud costs" },
    synapse: { desc: "Search & metadata for scientific data" },
    airtable: { desc: "Bases, tables and records: read, create and update" },
    filesystem: { desc: "Read/write files in an authorised folder (local server)" },
    browser: {
      name: "Browser",
      desc: "Let the model act in a browser (fill in forms, click) on your connected sites.",
    },
  },
  categories: {
    search: "Search & web",
    dev: "Development",
    data: "Data & storage",
    productivity: "Productivity",
    crm: "CRM & support",
    finance: "Finance & payments",
    design: "Design & sites",
    automation: "Automation",
    ai: "AI & models",
    other: "Other",
  },
  auth: {
    builtin: {
      label: "Built-in",
      title:
        "Ships with the app: nothing to connect, nothing to pay, no account to link. Just turn it on.",
    },
    directFull:
      "The service's sign-in page opens: you accept, and that's it. Nothing to copy-paste, no key to create.",
    byoOnly: {
      label: "Your keys",
      title: (what, reason) => `For ${what}, your own keys are needed — ${reason}.`,
    },
    byoLimited: {
      label: "1-click, limited",
      title: (what, reason) =>
        `One-click sign-in, nothing to create. For ${what}, your own keys will be needed — ${reason}.`,
    },
    device: {
      label: "Device",
      title: "A code to enter on the service's site, and that's it. No key to create.",
    },
    oneClick: "1-click",
    local: {
      label: "Local",
      title:
        "This tool runs on your machine: your folders and your credentials stay with you, and are never sent to the model.",
    },
    broker: {
      label: (brand) => `Via ${brand}`,
      title: (brand) =>
        `You sign in to your account, and ${brand} handles the rest: nothing to create, no code to paste.`,
    },
    apikey: {
      label: "Key required",
      title:
        "This service asks for a key, to fetch on its site and paste here. There is no sign-in page.",
    },
    oneClickRemote: {
      label: "1-click",
      title:
        "The service's sign-in page opens in your browser: you accept, and that's it. Nothing to create.",
    },
    byoSafe: (brand) =>
      `Your credentials stay encrypted on your device and go through no ${brand} server.`,
    reasonAdminConsent: "only an administrator of your organisation can authorise it",
    reasonGoogleReview: (brand) =>
      `Google is still reviewing ${brand} before opening this access in one click (in progress)`,
    thisAccess: "this access",
  },
} satisfies Messages["connectorCatalog"];
