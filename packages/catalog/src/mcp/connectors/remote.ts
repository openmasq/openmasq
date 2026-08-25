import type { McpConnector } from "../types";

/**
 * Remote HTTP+OAuth connectors — every one is DCR-verified (one-click, no PAT).
 * Transcribed verbatim from `packages/ui/src/components/Settings/mcpPresets.ts`.
 */
export const REMOTE: McpConnector[] = [
  // Recherche & web (brique "Recherche → synthèse" / "Scraping → base de
  // connaissance"). ONLY **Exa** still authenticates with an API KEY (pasted into the
  // endpoint URL, e.g. `?exaApiKey=…`) — NOT one-click. Tavily/Firecrawl/Apify/Bright
  // Data implement the MCP OAuth spec with DCR (one-click, verified live: their
  // `registration_endpoint` accepts an open registration). Their results flow back
  // through the SAME redaction as any tool result, so external web content is
  // scrubbed before the chat model sees it.
  { id: "exa", name: "Exa", desc: "Recherche web & code, crawl de pages", category: "search", tone: "mint", transport: "remote", auth: "apikey", url: "https://mcp.exa.ai/mcp" },
  { id: "tavily", name: "Tavily", desc: "Recherche web temps réel + extraction/crawl", category: "search", tone: "sky", transport: "remote", url: "https://mcp.tavily.com/mcp/" },
  { id: "firecrawl", name: "Firecrawl", desc: "Scraping & crawl de sites en Markdown", category: "search", tone: "amber", transport: "remote", url: "https://mcp.firecrawl.dev/v2/mcp" },
  { id: "notion", name: "Notion", desc: "Rechercher, lire et créer vos pages et bases Notion", category: "productivity", tone: "sky", transport: "remote", url: "https://mcp.notion.com/mcp", hosts: ["notion.com", "notion.so"] },
  // First-party remote MCP (Streamable HTTP + OAuth/DCR — one-click, like Notion).
  // Search email + calendar, draft/send, threads, labels, reminders, events.
  // Requires a Superhuman Business plan with Ask AI enabled.
  // desc mirrors Gmail/Outlook's "…envoyer des emails…" wording ON PURPOSE: the terse
  // "Email & agenda" made the model omit Superhuman when suggesting email connectors for
  // "envoie un mail" (it proposed only the household-name Gmail/Outlook) — the suggestion
  // is picked from the desc, so it must name the send-email capability explicitly.
  { id: "superhuman", name: "Superhuman", desc: "Rechercher, lire et envoyer des emails, agenda", category: "productivity", tone: "violet", transport: "remote", url: "https://mcp.mail.superhuman.com/mcp", hosts: ["mail.superhuman.com"] },
  { id: "linear", name: "Linear", desc: "Créer et suivre issues, projets et cycles", category: "dev", tone: "violet", transport: "remote", url: "https://mcp.linear.app/mcp", hosts: ["linear.app"] },
  { id: "atlassian", name: "Atlassian", desc: "Rechercher et gérer tickets Jira et pages Confluence", category: "dev", tone: "sky", transport: "remote", url: "https://mcp.atlassian.com/v1/mcp", hosts: ["atlassian.net", "atlassian.com"] },
  { id: "asana", name: "Asana", desc: "Gérer tâches, projets et portfolios", category: "productivity", tone: "pink", transport: "remote", url: "https://mcp.asana.com/v2/mcp", hosts: ["asana.com"] },
  // Fireflies — meeting transcripts/summaries. Now one-click OAuth/DCR (verified live
  // at `https://api.fireflies.ai/register`); the legacy `Authorization: Bearer` API-key
  // mode was dropped from the catalog.
  { id: "fireflies", name: "Fireflies", desc: "Transcriptions, résumés & actions de réunions", category: "productivity", tone: "violet", transport: "remote", url: "https://api.fireflies.ai/mcp", hosts: ["fireflies.ai"] },
  { id: "monday", name: "monday.com", desc: "Lire et mettre à jour vos boards et items", category: "productivity", tone: "pink", transport: "remote", url: "https://mcp.monday.com/mcp", hosts: ["monday.com"] },
  { id: "sentry", name: "Sentry", desc: "Consulter erreurs, issues et releases", category: "dev", tone: "amber", transport: "remote", url: "https://mcp.sentry.dev/mcp", hosts: ["sentry.io"] },
  { id: "vercel", name: "Vercel", desc: "Suivre déploiements, projets et logs", category: "dev", tone: "mint", transport: "remote", url: "https://mcp.vercel.com", hosts: ["vercel.com", "vercel.app"] },
  { id: "neon", name: "Neon", desc: "Interroger vos bases Postgres serverless", category: "data", tone: "mint", transport: "remote", url: "https://mcp.neon.tech/mcp", hosts: ["neon.tech"] },
  // Hosted remote MCP with OAuth 2.1 + dynamic client registration (one-click, no
  // PAT). `project_ref`/`read_only` are optional URL scopes; mutations are gated by
  // the desktop write-confirmation dialog.
  { id: "supabase", name: "Supabase", desc: "Base de données, edge functions, logs", category: "data", tone: "mint", transport: "remote", url: "https://mcp.supabase.com/mcp", hosts: ["supabase.com", "supabase.co"] },
  { id: "semgrep", name: "Semgrep", desc: "Analyser la sécurité de votre code", category: "dev", tone: "mint", transport: "remote", url: "https://mcp.semgrep.ai/mcp", hosts: ["semgrep.dev"] },
  { id: "stripe", name: "Stripe", desc: "Consulter paiements, clients et factures", category: "finance", tone: "violet", transport: "remote", url: "https://mcp.stripe.com", hosts: ["stripe.com"] },
  { id: "paypal", name: "PayPal", desc: "Consulter paiements, factures et commandes", category: "finance", tone: "sky", transport: "remote", url: "https://mcp.paypal.com/mcp", hosts: ["paypal.com"] },
  { id: "square", name: "Square", desc: "Consulter paiements, catalogue et commandes", category: "finance", tone: "mint", transport: "remote", url: "https://mcp.squareup.com/mcp", hosts: ["squareup.com"] },
  { id: "close", name: "Close", desc: "CRM : gérer leads, contacts et opportunités", category: "crm", tone: "violet", transport: "remote", url: "https://mcp.close.com/mcp", hosts: ["close.com"] },
  { id: "intercom", name: "Intercom", desc: "Consulter conversations, contacts et tickets", category: "crm", tone: "mint", transport: "remote", url: "https://mcp.intercom.com/mcp", hosts: ["intercom.com"] },
  // Hosted remote MCP with OAuth + dynamic client registration (one-click, no PAT).
  // Full CRM access — people/companies/deals/tasks/notes; writes gated by the desktop
  // write-confirmation dialog.
  { id: "attio", name: "Attio", desc: "CRM : contacts, sociétés, deals, notes", category: "crm", tone: "sky", transport: "remote", url: "https://mcp.attio.com/mcp", hosts: ["attio.com"] },
  // ⚠️ Zapier has TWO endpoint families and only one of them accepts an OAuth bearer.
  // `/api/v1/connect` is the OAuth/DCR one ("connect from inside the client", no server
  // to create first). The `/api/mcp/*` family — including the bare `/api/mcp/mcp` we used
  // to ship — wants a Zapier SERVER TOKEN (the per-user `/api/mcp/s/<key>/mcp` URL) and
  // answers 401 `invalid_token` to a valid OAuth access token, so consent succeeded and
  // the very next request failed with the SDK's "Server returned 401 after successful
  // authentication". **The tell is in the challenge**: a spec-compliant OAuth resource
  // names its metadata (`WWW-Authenticate: Bearer resource_metadata="…"`), while
  // `/api/mcp/mcp` returns a bare `realm="Zapier MCP", error="invalid_token"`. Both paths
  // publish RFC 9728 metadata, so "advertises OAuth + open DCR" was NOT enough to vet a
  // connector — require the `resource_metadata` pointer too.
  { id: "zapier", name: "Zapier", desc: "Déclencher des automatisations sur 8000+ apps", category: "automation", tone: "amber", transport: "remote", url: "https://mcp.zapier.com/api/v1/connect", hosts: ["zapier.com"] },
  { id: "canva", name: "Canva", desc: "Créer et exporter vos designs Canva", category: "design", tone: "sky", transport: "remote", url: "https://mcp.canva.com/mcp", hosts: ["canva.com"] },
  { id: "wix", name: "Wix", desc: "Gérer sites, boutiques et réservations", category: "design", tone: "amber", transport: "remote", url: "https://mcp.wix.com/mcp", hosts: ["wix.com"] },
  { id: "webflow", name: "Webflow", desc: "Gérer sites, CMS et pages", category: "design", tone: "violet", transport: "remote", url: "https://mcp.webflow.com/mcp", hosts: ["webflow.com", "webflow.io"] },
  { id: "dropbox", name: "Dropbox", desc: "Rechercher et lire vos fichiers Dropbox", category: "data", tone: "sky", storage: true, transport: "remote", url: "https://mcp.dropbox.com/mcp", hosts: ["dropbox.com"] },
  { id: "huggingface", name: "Hugging Face", desc: "Explorer modèles, datasets et Spaces", category: "ai", tone: "pink", transport: "remote", url: "https://huggingface.co/mcp", hosts: ["huggingface.co"] },
  // ── Additional one-click DCR connectors — each VERIFIED LIVE: the `/mcp` endpoint
  //    returns a 401 OAuth challenge AND its `registration_endpoint` accepts an open
  //    Dynamic Client Registration (POST → 200/201 + `client_id`, no PAT). Excluded on
  //    purpose: Plaid (DCR rejected open registration → 400), Stytch/Brevo (no reachable
  //    canonical `/mcp` endpoint), Exa (API-key only). ──
  { id: "amplitude", name: "Amplitude", desc: "Analytics produit, dashboards, expériences & feature flags", category: "data", tone: "violet", transport: "remote", url: "https://mcp.amplitude.com/mcp", hosts: ["amplitude.com"] },
  { id: "posthog", name: "PostHog", desc: "Analytics produit, insights, dashboards & feature flags", category: "data", tone: "sky", transport: "remote", url: "https://mcp.posthog.com/mcp", hosts: ["posthog.com"],
    // PostHog exposes ~280 tools behind one `exec {command}` CLI meta-tool. Expand the
    // HIGH-VALUE analytics surface DIRECTLY (`wrapExecMeta`) so small models stop looping
    // on the CLI; the long tail stays reachable via the retained `exec` fallback. These
    // prefixes are matched against PostHog's REAL tool names (verified live) — keep the
    // set focused (a 40-tool list is as bad as the CLI for a small router).
    execMeta: { include: ["execute-sql", "read-data-schema", "insight-query", "insight-create", "dashboard-get", "dashboards-get-all", "dashboard-create", "actions-get-all", "feature-flag-get", "cohorts-list", "cohorts-retrieve", "survey-get", "surveys-get-all"] } },
  { id: "apify", name: "Apify", desc: "Scraping & automatisation via la bibliothèque d'Actors", category: "search", tone: "amber", transport: "remote", url: "https://mcp.apify.com" },
  { id: "brightdata", name: "Bright Data", desc: "Accès temps réel à des données web publiques", category: "search", tone: "sky", transport: "remote", url: "https://mcp.brightdata.com/mcp" },
  { id: "cloudflare", name: "Cloudflare", desc: "Workers, stockage, IA & primitives de calcul", category: "dev", tone: "amber", transport: "remote", url: "https://bindings.mcp.cloudflare.com/mcp", hosts: ["cloudflare.com"] },
  { id: "netlify", name: "Netlify", desc: "Déployer, gérer et sécuriser des sites Netlify", category: "dev", tone: "mint", transport: "remote", url: "https://netlify-mcp.netlify.app/mcp", hosts: ["netlify.com", "netlify.app"] },
  { id: "prisma-postgres", name: "Prisma Postgres", desc: "Interroger & gérer votre base Prisma Postgres", category: "data", tone: "mint", transport: "remote", url: "https://mcp.prisma.io/mcp", hosts: ["prisma.io"] },
  { id: "cloudinary", name: "Cloudinary", desc: "Gestion & transformation d'images et de vidéos", category: "design", tone: "sky", transport: "remote", url: "https://asset-management.mcp.cloudinary.com/mcp", hosts: ["cloudinary.com"] },
  { id: "jotform", name: "Jotform", desc: "Créer des formulaires & analyser les réponses", category: "productivity", tone: "pink", transport: "remote", url: "https://mcp.jotform.com/mcp", hosts: ["jotform.com"] },
  { id: "websitepublisher", name: "WebsitePublisher.ai", desc: "Créer et publier des sites par conversation", category: "design", tone: "violet", transport: "remote", url: "https://mcp.websitepublisher.ai/mcp" },
  { id: "morningstar", name: "Morningstar", desc: "Données d'investissement & de marché", category: "finance", tone: "violet", transport: "remote", url: "https://mcp.morningstar.com/mcp", hosts: ["morningstar.com"] },
  { id: "vantage", name: "Vantage", desc: "Analyse de vos coûts cloud", category: "finance", tone: "amber", transport: "remote", url: "https://mcp.vantage.sh/mcp", hosts: ["vantage.sh"] },
  { id: "synapse", name: "Synapse", desc: "Recherche & métadonnées de données scientifiques", category: "data", tone: "sky", transport: "remote", url: "https://mcp.synapse.org/mcp", hosts: ["synapse.org"] },
  // Airtable — first-party hosted MCP (Streamable HTTP + OAuth/DCR, one-click, no PAT).
  // Verified live: `/mcp` returns a 401 OAuth challenge and the AS
  // (`https://airtable.com/oauth2/v1`) advertises a `registration_endpoint` that accepts
  // an open registration (POST → 201 + `client_id`, public client, PKCE S256). Bases,
  // tables and records; writes gated by the desktop write-confirmation dialog.
  { id: "airtable", name: "Airtable", desc: "Bases, tables et enregistrements : lire, créer et mettre à jour", category: "data", tone: "sky", transport: "remote", url: "https://mcp.airtable.com/mcp", hosts: ["airtable.com"] },
];
