/**
 * La PHRASE de présentation de chaque connecteur — le bloc « à propos » en tête de
 * `McpConnectorModal`. Une phrase concise : ce que fait l'entreprise ou le produit.
 *
 * L'ADRESSE officielle n'est pas ici : elle ne se traduit pas, et elle vit avec les ids
 * dans `ui/src/pages/Settings/mcp/mcpConnectorInfo.ts`. Ce sont ces deux tables ensemble
 * qui portent la parité : le fichier UI se déclare `Record<keyof ConnectorsMessages, …>`,
 * donc un connecteur présenté sans adresse — ou l'inverse — ne compile pas. Et
 * `mcpConnectorInfo.test.ts` vérifie l'autre bord, celui que le compilateur ne voit pas :
 * que chaque id existe bien au catalogue (`@openmasq/catalog/mcp`).
 *
 * Un id ABSENT des deux ne rend simplement aucun bloc (le serveur `filesystem` local n'a
 * pas d'entreprise) : l'omission est une décision, pas un trou.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface ConnectorsMessages {
  exa: string;
  tavily: string;
  firecrawl: string;
  notion: string;
  airtable: string;
  superhuman: string;
  linear: string;
  atlassian: string;
  asana: string;
  fireflies: string;
  monday: string;
  sentry: string;
  vercel: string;
  neon: string;
  supabase: string;
  semgrep: string;
  stripe: string;
  paypal: string;
  square: string;
  close: string;
  intercom: string;
  attio: string;
  zapier: string;
  canva: string;
  wix: string;
  webflow: string;
  dropbox: string;
  huggingface: string;
  github: string;
  "google-calendar": string;
  gmail: string;
  "google-drive": string;
  slack: string;
  amplitude: string;
  posthog: string;
  apify: string;
  brightdata: string;
  cloudflare: string;
  netlify: string;
  "prisma-postgres": string;
  cloudinary: string;
  jotform: string;
  websitepublisher: string;
  morningstar: string;
  vantage: string;
  synapse: string;
  "google-docs": string;
  "google-sheets": string;
  "google-tasks": string;
  "google-analytics": string;
  "microsoft-outlook": string;
  "microsoft-onedrive": string;
  "microsoft-sharepoint": string;
  "microsoft-teams": string;
}
