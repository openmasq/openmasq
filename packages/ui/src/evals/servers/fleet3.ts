import { str, type FakeServer } from "./kit";

// Third wave — the remaining REMOTE search/dev/data connectors, transcribed from
// vendors' hosted MCPs (1-2 KEY tools per connector: the goal is for `all` mode to
// OFFER the whole catalogue; the fine-grained truth realigns on the first
// `tools/list` against a real account). Fixture results themed Karl Studio / Atelier Torbel.

const one = (id: string, tools: FakeServer["tools"]): FakeServer => ({ id, tools });
const q = (d: string) => ({ type: "object", properties: { query: str(d) }, required: ["query"] });

export const SEARCH_FLEET: FakeServer[] = [
  one("exa", [
    { name: "web_search_exa", description: "Recherche web sémantique (résultats + extraits).", inputSchema: q("Requête"), result: "1. « Karl Studio — agence de design » karl-studio.fr : agence normande, identité visuelle et web." },
  ]),
  one("tavily", [
    { name: "tavily-search", description: "Recherche web temps réel avec extraits sourcés.", inputSchema: q("Requête"), result: "Top : karl-studio.fr — « Agence de design, Évreux. Clients : PME et studios. »" },
    { name: "tavily-extract", description: "Extraire le contenu texte d'une ou plusieurs URLs.", inputSchema: { type: "object", properties: { urls: { type: "array", description: "URLs à extraire" } }, required: ["urls"] }, result: "karl-studio.fr — L'agence accompagne PME et studios : identité, web, print. Contact : contact@karl-studio.fr." },
  ]),
  one("firecrawl", [
    { name: "firecrawl_scrape", description: "Scraper une page web en Markdown propre.", inputSchema: { type: "object", properties: { url: str("URL de la page") }, required: ["url"] }, result: "# Karl Studio\nAgence de design. Services : identité, web. Tarifs sur devis." },
  ]),
  one("apify", [
    { name: "call-actor", description: "Exécuter un Actor Apify (scraping/automatisation).", inputSchema: { type: "object", properties: { actor: str("Nom de l'Actor"), input: str("Entrée JSON") }, required: ["actor"] }, result: "Run terminé : 12 éléments extraits (dataset ds-8842)." },
  ]),
  one("brightdata", [
    { name: "search_engine", description: "Recherche web via le réseau Bright Data.", inputSchema: q("Requête"), result: "3 résultats — karl-studio.fr en tête (agence de design, Évreux)." },
  ]),
];

export const DEV_FLEET: FakeServer[] = [
  one("atlassian", [
    { name: "searchJiraIssuesUsingJql", description: "Rechercher des tickets Jira (JQL).", inputSchema: q("JQL ou mots-clés"), result: "KAV-118 « Export CSV vide » [To Do] · KAV-121 « Lenteur dashboard » [In Progress]" },
    { name: "createJiraIssue", description: "Créer un ticket Jira. Action d'écriture.", inputSchema: { type: "object", properties: { summary: str("Titre"), description: str("Description") }, required: ["summary"] }, result: "Ticket KAV-122 créé." },
  ]),
  one("sentry", [
    { name: "find_issues", description: "Lister les erreurs/issues Sentry récentes d'un projet.", inputSchema: { type: "object", properties: { project: str("Projet, optionnel") } }, result: "TypeError: export.generate is undefined — 41 événements, 12 utilisateurs, depuis hier (issue ZORVIA-APP-3F)." },
  ]),
  one("vercel", [
    { name: "list_deployments", description: "Lister les déploiements récents d'un projet.", inputSchema: { type: "object", properties: { project: str("Projet, optionnel") } }, result: "site — Ready (il y a 2 h) · app-preview — Error (hier 18:12)" },
    { name: "get_deployment_build_logs", description: "Lire les logs de build d'un déploiement.", inputSchema: { type: "object", properties: { deployment: str("Id du déploiement") }, required: ["deployment"] }, result: "Error: Cannot find module '@openmasq/ui' — étape build, code 1." },
  ]),
  one("neon", [
    { name: "run_sql", description: "Exécuter une requête SQL sur la base Neon.", inputSchema: q("Requête SQL"), result: "2 lignes — (Karl Studio, 18000, payé) · (Atelier Torbel, 7500, en_attente)" },
  ]),
  one("supabase", [
    { name: "execute_sql", description: "Exécuter du SQL sur le projet Supabase.", inputSchema: q("Requête SQL"), result: "1 ligne — { client: 'Atelier Torbel', facture: 'INV-3007', statut: 'payée' }" },
    { name: "list_tables", description: "Lister les tables du schéma.", inputSchema: { type: "object", properties: {} }, result: "clients · factures · paiements · projets" },
  ]),
  one("semgrep", [
    { name: "semgrep_scan", description: "Analyser la sécurité d'un code/dépôt.", inputSchema: { type: "object", properties: { path: str("Chemin ou dépôt") }, required: ["path"] }, result: "2 findings : injection SQL possible (api/query.ts:42, HIGH) · secret en dur (config.ts:7, MED)." },
  ]),
  one("cloudflare", [
    { name: "workers_list", description: "Lister les Workers du compte.", inputSchema: { type: "object", properties: {} }, result: "zorvia-updates (déployé lundi) · zorvia-edge (déployé il y a 3 semaines)" },
  ]),
  one("netlify", [
    { name: "netlify-deploy-services", description: "Lister/déployer les sites Netlify.", inputSchema: { type: "object", properties: { action: str("list ou deploy") }, required: ["action"] }, result: "site-vitrine — Published (il y a 4 jours)." },
  ]),
  one("prisma-postgres", [
    { name: "execute_query", description: "Interroger la base Prisma Postgres.", inputSchema: q("Requête SQL"), result: "3 lignes retournées (clients actifs)." },
  ]),
  one("dropbox", [
    { name: "search_files", description: "Rechercher des fichiers Dropbox par nom/contenu.", inputSchema: q("Termes de recherche"), result: "« Contrat Karl Studio.pdf » (/Clients, modifié il y a 3 jours)" },
    { name: "read_file", description: "Lire le contenu texte d'un fichier Dropbox.", inputSchema: { type: "object", properties: { path: str("Chemin du fichier") }, required: ["path"] }, result: "Contrat de prestation — 24 mois, 48 000 € HT, préavis 60 jours." },
  ]),
  one("airtable", [
    { name: "list_records", description: "Lire les enregistrements d'une table Airtable.", inputSchema: { type: "object", properties: { base: str("Base"), table: str("Table") }, required: ["table"] }, result: "CRM/Prospects : Atelier Torbel (relance ven.) · Studio Velin (devis envoyé)" },
    { name: "create_record", description: "Créer un enregistrement. Action d'écriture.", inputSchema: { type: "object", properties: { table: str("Table"), fields: str("Champs JSON") }, required: ["table", "fields"] }, result: "Enregistrement créé (rec9921)." },
  ]),
  one("huggingface", [
    { name: "model_search", description: "Rechercher des modèles sur le Hub Hugging Face.", inputSchema: q("Termes de recherche"), result: "mistralai/Mistral-Small-3.2 (24B, apache-2.0, 4,1k ❤) · google/gemma-4-26b (gemma, 9,8k ❤)" },
  ]),
];
