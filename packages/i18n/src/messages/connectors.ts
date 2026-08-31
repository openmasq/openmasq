/**
 * Each connector's introduction SENTENCE — the « about » block at the top of
 * `McpConnectorModal`. One concise sentence: what the company or the product does.
 *
 * The official ADDRESS is not here: it does not translate, and it lives with the ids
 * in `ui/src/pages/Settings/mcp/mcpConnectorInfo.ts`. It is those two tables together
 * that carry the parity: the UI file declares itself `Record<keyof ConnectorsMessages, …>`,
 * so a connector introduced without an address — or the reverse — does not compile. And
 * `mcpConnectorInfo.test.ts` checks the other edge, the one the compiler cannot see:
 * that every id really exists in the catalogue (`@openmasq/catalog/mcp`).
 *
 * An id ABSENT from both simply renders no block (the local `filesystem` server has
 * no company): the omission is a decision, not a hole.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
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
