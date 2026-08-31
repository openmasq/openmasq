/**
 * Tranche « connectors » du catalogue EN — traduit de la source (`../fr/connectors.ts`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/connectors.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const connectors = {
  exa: "Exa is a web search engine built for AI, returning results and page content a model can work with.",
  tavily:
    "Tavily provides a real-time web search and extraction API designed for AI agents and applications.",
  firecrawl:
    "Firecrawl turns any site into clean data (Markdown) through its scraping and crawling service.",
  notion:
    "Notion is an all-in-one workspace for notes, documents, databases and team wikis.",
  airtable:
    "Airtable combines the simplicity of a spreadsheet with the power of a database to organise projects and team data.",
  superhuman:
    "Superhuman is a premium email client built around speed, with a calendar and built-in AI features.",
  linear:
    "Linear is a fast issue-tracking and project-management tool, made for product and engineering teams.",
  atlassian:
    "Atlassian makes Jira and Confluence, ticket-tracking and documentation tools for teams.",
  asana: "Asana is a work-management platform for organising tasks, projects and team goals.",
  fireflies:
    "Fireflies.ai automatically records, transcribes and summarises your meetings, and pulls out the action items.",
  monday:
    "monday.com is a Work OS platform for building custom boards, workflows and project tracking.",
  sentry:
    "Sentry is an error-tracking and application-performance monitoring platform for developers.",
  vercel:
    "Vercel is a deployment and hosting platform for front-end web applications (the makers of Next.js).",
  neon: "Neon offers a serverless PostgreSQL database with branching and automatic scaling.",
  supabase:
    "Supabase is an open-source Firebase alternative: a Postgres database, authentication, storage and edge functions.",
  semgrep:
    "Semgrep is an open-source static analysis tool for finding bugs and security flaws in code.",
  stripe:
    "Stripe is online payment infrastructure for taking payments, invoicing and managing subscriptions.",
  paypal: "PayPal is a global online payment and money-transfer platform.",
  square: "Square (Block) provides payment, point-of-sale and business-management solutions.",
  close:
    "Close is a sales CRM made for sales teams, with calls, emails and deal tracking built in.",
  intercom:
    "Intercom is a customer-relationship platform: messaging, support and AI assistance for businesses.",
  attio: "Attio is a modern, flexible CRM for managing contacts, companies and deals from your own data.",
  zapier:
    "Zapier automates tasks by connecting more than 8,000 apps through no-code workflows.",
  canva:
    "Canva is an online graphic-design tool for creating visuals, presentations and documents easily.",
  wix: "Wix is a platform for building websites, online stores and booking systems, with no code.",
  webflow:
    "Webflow is a visual website builder with a built-in CMS, to design and publish without coding.",
  dropbox: "Dropbox is a cloud file storage and sharing service.",
  huggingface:
    "Hugging Face is the reference platform for sharing AI models, datasets and applications (Spaces).",
  github:
    "GitHub is the most widely used code-hosting and developer-collaboration platform (Microsoft).",
  gmail: "Gmail is Google's email service.",
  slack: "Slack is a team messaging platform organised into channels (Salesforce).",
  amplitude:
    "Amplitude is a product-analytics platform for understanding user journeys and steering features.",
  posthog:
    "PostHog is an open-source product-analytics platform: events, session replays and feature flags.",
  apify:
    "Apify is a web scraping and automation platform, with a library of ready-made Actors.",
  brightdata: "Bright Data provides real-time access to public web data at scale.",
  cloudflare:
    "Cloudflare provides the network, the security and the compute platform (Workers) behind a large share of the web.",
  netlify:
    "Netlify is a deployment and hosting platform for modern websites and web applications.",
  cloudinary:
    "Cloudinary manages, transforms and delivers images and video for websites and applications.",
  jotform:
    "Jotform is an online form builder for collecting responses, payments and signatures.",
  websitepublisher:
    "WebsitePublisher.ai builds and publishes complete websites from a simple conversation.",
  morningstar:
    "Morningstar is a reference in financial research: market data, analysis and fund ratings.",
  vantage:
    "Vantage centralises and analyses your cloud costs (AWS, GCP, Azure…) so you can understand and cut them.",
  synapse:
    "Synapse (Sage Bionetworks) is a collaborative platform for sharing scientific and biomedical data.",
  "google-calendar": "Google Calendar is Google's calendar and event-management service.",
  "google-drive": "Google Drive is Google's cloud file storage and sharing service.",
  "prisma-postgres":
    "Prisma Postgres is a managed PostgreSQL database, built around the Prisma ORM.",
  "google-docs": "Google Docs is Google's collaborative online word processor.",
  "google-sheets": "Google Sheets is Google's collaborative online spreadsheet.",
  "google-tasks":
    "Google Tasks is Google's task manager, built into Gmail and Calendar.",
  "google-analytics":
    "Google Analytics measures the audience and traffic of your sites and apps (GA4).",
  "microsoft-outlook": "Outlook is the Microsoft 365 email and calendar service.",
  "microsoft-onedrive":
    "OneDrive is the Microsoft 365 cloud file storage and sharing service.",
  "microsoft-sharepoint":
    "SharePoint hosts the Microsoft 365 team sites and document libraries.",
  "microsoft-teams":
    "Microsoft Teams is the Microsoft 365 collaboration platform: teams, channels and meetings.",
} satisfies Messages["connectors"];
